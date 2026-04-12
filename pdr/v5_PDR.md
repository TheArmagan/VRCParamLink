# VRCParamLink v5 PDR — OpenVR Tracker Bridge (Native Rust)

## 1. Doküman Amacı

Bu doküman, VRCParamLink v5 kapsamında eklenen **OpenVR Tracker Bridge** bileşenini tanımlar. Bu bileşen, SteamVR üzerinden takip edilen tüm cihazların (HMD, kontrolörler, tracker'lar) konum ve rotasyon verilerini okuyup VRChat'in OSC Trackers formatına dönüştüren bağımsız bir **Rust native** uygulamasıdır.

**Amaç:** Bir oyuncunun gerçek vücut hareketlerini (full-body tracking verisi) VRCParamLink üzerinden aynı odadaki başka bir oyuncuya aktarmak için kaynak veri üretmektir.

## 2. Problem Tanımı

VRCParamLink mevcut durumda yalnızca avatar parametreleri (`/avatar/parameters/*`) ve input kontrolleri (`/input/*`) senkronize edebilmektedir. Ancak full-body tracking verisinin (tracker pozisyonları ve rotasyonları) aktarılması için:

1. OpenVR/SteamVR üzerinden fiziksel tracker cihaz verilerinin okunması gerekir.
2. Bu verinin VRChat'in kabul ettiği `/tracking/trackers/*` OSC formatına dönüştürülmesi gerekir.
3. Saniyede 20 kez (50ms aralıkla) JSON batch olarak stdout'a yazılarak Electron ana sürecine iletilmesi gerekir.

Bu bileşen yalnızca **okuma ve format dönüştürme** yapar — ağ iletimi, oda yönetimi ve senkronizasyon Electron + backend tarafında kalır.

## 3. Mimari Konum

```
┌──────────────────────────────────────────────────────────────────────┐
│ SteamVR (vrserver.exe)                                               │
│   HMD (idx 0) + Controllers (idx 1,2) + Trackers (idx 3..10)        │
└─────────────────────────────┬────────────────────────────────────────┘
                              │ OpenVR API
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│ vrcpl-tracker-bridge.exe  (Rust native)                              │
│                                                                      │
│  1. vrserver.exe süreç kontrolü (çalışmıyorsa başlatma, çık)        │
│  2. OpenVR init (ApplicationType::Other)                             │
│  3. stdin'den JSON komut bekle (start/stop/exit)                     │
│  4. "start" → Cihaz keşfi + slot atama + kalibrasyon                │
│  5. 50ms döngü: pose oku → offset uygula → JSON batch → stdout      │
│  6. "stop" → döngü durdur, "start" → yeniden kalibre               │
└──────────────┬───────────────────────────────┬───────────────────────┘
               │ stdout (JSON lines)            ▲ stdin (JSON commands)
               ▼                                │
┌──────────────────────────────────────────────────────────────────────┐
│ Electron Main Process                                                │
│   child_process.spawn                                                │
│   OSC 9001 dinler → VRMode+TrackingType algılar → stdin'e "start"   │
│   stdout parse → WebSocket → Backend → Room                         │
└──────────────────────────────────────────────────────────────────────┘
```

## 4. Özellik Detayları

### 4.1 Güvenli Başlatma: vrserver.exe Kontrolü

Uygulama kendi başına SteamVR **başlatmaz**. Başlangıçta:

1. Windows süreç listesinde `vrserver.exe` aranır.
2. Bulunursa → OpenVR init yapılır.
3. **Bulunmazsa** → hata mesajı yazdırılır ve uygulama çıkar (exit code 1).

Bu, kullanıcının istemeden SteamVR'ın açılmasını veya overlay modunda takılmasını önler.

```rust
// Pseudo
fn is_vrserver_running() -> bool {
    // Windows: tasklist /FI "IMAGENAME eq vrserver.exe" veya
    // sysinfo crate ile süreç listesi tarama
    ...
}
```

### 4.2 Stdin Komut Protokolü (Electron → Bridge)

Bridge, OSC portunu **dinlemez** (port 9001 zaten Electron'un OSC dinleyicisine aittir). Bunun yerine Electron ana süreci stdin üzerinden JSON komut gönderir.

VRMode=1 + TrackingType algılama mantığı **Electron tarafında** çalışır; koşul karşılandığında Electron, bridge'e `start` komutu gönderir.

**Komut formatı** (her satır bir JSON nesnesi):

| Komut | JSON | Açıklama |
|---|---|---|
| Başlat / Yeniden Kalibre | `{"cmd":"start"}` | Cihaz keşfi + kalibrasyon + tracking döngüsü başlat |
| Durdur | `{"cmd":"stop"}` | Tracking döngüsünü duraklat (OpenVR bağlantısı korunur) |
| Kapat | `{"cmd":"exit"}` | OpenVR shutdown, süreç temiz çıkış |

- `start` komutu her geldiğinde cihazlar yeniden keşfedilir ve kalibrasyon yeniden alınır.
- `stop` sonrası tekrar `start` gönderilebilir (yeniden kalibrasyon).
- stdin kapanırsa (Electron süreci ölürse) bridge otomatik çıkar.
- Tanınmayan JSON satırları sessizce yoksayılır.

### 4.3 OpenVR Cihaz Keşfi ve Slot Ataması

OpenVR `device_to_absolute_tracking_pose()` ile `MAX_TRACKED_DEVICE_COUNT` (64) cihaz sorgulanır. Her cihaz `tracked_device_class()` ile sınıflandırılır:

| OpenVR DeviceClass | VRChat OSC Slotu | Maks. Adet |
|---|---|---|
| `HMD` (index 0) | `/tracking/trackers/head` | 1 |
| `Controller` (LeftHand) | `/tracking/trackers/1` (sol el) | 1 |
| `Controller` (RightHand) | `/tracking/trackers/2` (sağ el) | 1 |
| `GenericTracker` | `/tracking/trackers/3` .. `/tracking/trackers/8` | 6 |

**Toplam: 11 cihaz** (1 HMD + 2 kontrolör + 8 tracker'a kadar). VRChat'in desteklediği en fazla 8 tracker + head formatına uygun.

**Slot atama kuralları:**
- Head → her zaman HMD (index 0).
- Controller sol/sağ → `tracked_device_index_for_controller_role()` ile belirlenir.
- GenericTracker'lar → keşfedilme sırasına göre slot 3..8.

### 4.4 Kalibrasyon (T-Pose Offset)

Tetikleyici alındığında (§4.2) anlık bir kalibrasyon snapshot'ı alınır:

1. Tüm aktif cihazların o anki pozisyon ve rotasyonları okunur.
2. HMD pozisyonu referans merkez olarak kaydedilir.
3. Her tracker için HMD'ye göre **relative offset** hesaplanır.
4. Bu offset daha sonra her frame'de uygulanarak VRChat'in beklediği koordinat sistemine dönüştürülür.

**Koordinat sistemi:**
- Unity sol-el koordinat sistemi (+Y yukarı).
- Pozisyonlar metre cinsinden (1.0 = 1m).
- Rotasyonlar Euler açıları (derece, Z-X-Y sırasıyla).

### 4.5 Pose Okuma ve Dönüştürme (50ms Döngü)

Her 50ms'de (saniyede 20 kere):

1. `system.device_to_absolute_tracking_pose(TrackingUniverseOrigin::Standing, 0.0)` çağrılır.
2. Geçerli cihazlar (`pose_is_valid && tracking_result == Running`) filtrelenir.
3. 3×4 dönüşüm matrisinden pozisyon (x, y, z) ve rotasyon (euler derece) çıkarılır.
4. Kalibrasyon offseti uygulanır.
5. JSON batch oluşturulup stdout'a tek satır olarak yazılır.

**Matris → Euler dönüşümü:**

OpenVR 3×4 matris formatı:
```
[m00 m01 m02 m03]    m03 = x pozisyon
[m10 m11 m12 m13]    m13 = y pozisyon
[m20 m21 m22 m23]    m23 = z pozisyon
```

Euler açıları (Unity Z-X-Y sırası, derece):
```
pitch (X) = asin(-m21)
yaw   (Y) = atan2(m20, m22)
roll  (Z) = atan2(m01, m11)
```

### 4.6 JSON Çıktı Formatı

Her 50ms'de stdout'a tek satır JSON yazılır. Electron süreci bunu `readline` ile parse eder.

```json
{
  "ts": 1712900000000,
  "trackers": [
    {
      "address": "/tracking/trackers/head",
      "position": [0.0, 1.65, 0.0],
      "rotation": [0.0, 0.0, 0.0]
    },
    {
      "address": "/tracking/trackers/1",
      "position": [-0.3, 1.0, 0.15],
      "rotation": [10.5, -5.2, 0.0]
    },
    {
      "address": "/tracking/trackers/2",
      "position": [0.3, 1.0, 0.15],
      "rotation": [10.5, 5.2, 0.0]
    },
    {
      "address": "/tracking/trackers/3",
      "position": [0.0, 0.95, 0.0],
      "rotation": [0.0, 0.0, 0.0]
    }
  ]
}
```

**Alan açıklamaları:**
| Alan | Tip | Açıklama |
|---|---|---|
| `ts` | `u64` | Unix epoch ms |
| `trackers` | `array` | Aktif tracker listesi |
| `trackers[].address` | `string` | VRChat OSC adresi |
| `trackers[].position` | `[f32; 3]` | X, Y, Z (metre, Unity sol-el) |
| `trackers[].rotation` | `[f32; 3]` | X, Y, Z euler (derece, Z-X-Y) |

### 4.7 Hata ve Durum Mesajları

Uygulama hata / durum bilgilerini **stderr** üzerinden JSON olarak yazar (stdout veri kanalı temiz kalır):

```json
{"level": "error", "msg": "vrserver.exe not running", "code": "NO_VRSERVER"}
{"level": "info",  "msg": "OpenVR initialized, 5 devices found"}
{"level": "info",  "msg": "Calibration complete, tracking started"}
{"level": "warn",  "msg": "Tracker 4 lost tracking"}
{"level": "info",  "msg": "VRMode deactivated, tracking paused"}
```

## 5. Teknik Kararlar

### 5.1 Dil ve Bağımlılıklar

| Karar | Değer |
|---|---|
| Dil | Rust (MSVC toolchain) |
| OpenVR binding | `openvr` crate (0.8.1) |
| JSON | `serde` + `serde_json` |
| Süreç listesi | `sysinfo` crate |
| Compile target | `x86_64-pc-windows-msvc` |

> **Not:** `openvr-sys` CMake ve MSVC C++ compiler gerektirir. MinGW desteklenmez.

### 5.2 Uygulama Yaşam Döngüsü

```
main()
  ├─ vrserver.exe kontrolü → yoksa çık (exit 1)
  ├─ OpenVR init (ApplicationType::Other)
  ├─ stdin reader thread başlat (JSON komut bekle)
  ├─ Ana döngü (50ms tick):
  │    ├─ stdin komutlarını drain et:
  │    │    ├─ "start" → cihaz keşfi + kalibrasyon + tracking_active = true
  │    │    ├─ "stop"  → tracking_active = false
  │    │    └─ "exit"  → çıkış
  │    └─ tracking_active ise: pose oku → dönüştür → JSON stdout
  └─ stdin kapanırsa (Electron process ölürse) → otomatik çıkış
```

### 5.3 Performans Gereksinimleri

- Pose okuma + JSON serialize ≤ 2ms hedef (50ms bütçenin %4'ü).
- Bellek: tek JSON batch ≈ 2 KB, sürekli alloc yok (buffer reuse).
- CPU: tek çekirdek üzerinde < %1 kullanım.

### 5.4 Binary Çıktısı

- Build: `cargo build --release`
- Çıktı: `native-windows/target/release/vrcpl-tracker-bridge.exe`
- Electron `extraResources` olarak paketlenir.

## 6. Proje Yapısı

```
native-windows/
├── Cargo.toml
├── Cargo.lock
└── src/
    ├── main.rs           # Entry point, stdin komut döngüsü, yaşam döngüsü
    ├── vrserver_check.rs  # vrserver.exe süreç kontrolü
    ├── openvr_bridge.rs   # OpenVR init, cihaz keşfi, pose okuma
    ├── calibration.rs     # T-Pose offset hesaplama
    ├── math_utils.rs      # Matris → Euler dönüşüm yardımcıları
    └── types.rs           # Ortak struct/enum tanımları, StdinCommand, JSON serde
```

## 7. Electron Entegrasyonu

### 7.1 Tracker Bridge Process Manager

`electron-app/src/main/lib/tracker-bridge.ts` — Rust bridge sürecini yönetir.

```
TrackerBridge
  ├─ spawn()  → child_process.spawn("vrcpl-tracker-bridge.exe")
  │              stdio: ['pipe', 'pipe', 'pipe']
  │              stdin  → JSON komut gönder
  │              stdout → readline ile JSON batch parse
  │              stderr → log satırları (isteğe bağlı console.log)
  ├─ sendCommand(cmd)  → stdin'e JSON satır yaz
  ├─ startTracking()   → sendCommand({cmd:"start"})
  ├─ stopTracking()    → sendCommand({cmd:"stop"})
  ├─ destroy()         → sendCommand({cmd:"exit"}) + process.kill()
  └─ onBatch callback  → her stdout JSON satırında tetiklenir
```

**Binary konum:** `extraResources/vrcpl-tracker-bridge.exe`
- Development: `native-windows/target/release/vrcpl-tracker-bridge.exe`
- Production: `process.resourcesPath + '/vrcpl-tracker-bridge.exe'`

**Yaşam döngüsü:**
- Bridge, Electron `app.whenReady()` sırasında **bir kez** spawn edilir.
- `trackingSendEnabled` toggle'ı bridge'i spawn/kill etmez; sadece `start`/`stop` stdin komutu gönderir.
- `app.on('window-all-closed')` → `bridge.destroy()` çağrılır.
- Bridge process crash olursa stderr log'u okunur, hata state'e yazılır.

### 7.2 VRMode + TrackingType Algılama (50ms Window)

`osc-sync.ts` içinde mevcut OSC dinleyici üzerine eklenir. VRChat şu builtin parametreleri gönderir:

| OSC Adresi | Tip | Değerler |
|---|---|---|
| `/avatar/parameters/VRMode` | int | 0 = Desktop, 1 = VR |
| `/avatar/parameters/TrackingType` | int | 0 = uninitialized, 3 = HMD, 4 = HMD+Controllers, 6 = Full Body |

**Algılama mantığı:**

```
VRMode=1 geldiğinde:
  vrModeTimestamp = Date.now()
  eğer (Date.now() - trackingTypeTimestamp) < 50ms → tetikle

TrackingType > 0 geldiğinde:
  trackingTypeTimestamp = Date.now()
  eğer (Date.now() - vrModeTimestamp) < 50ms → tetikle

Tetikleme → onVRTrackingDetected() callback'i çağır
VRMode=0 geldiğinde → onVRTrackingLost() callback'i çağır
```

Bu parametreler `isBuiltinVrcParam()` tarafından filtrelenir, bu yüzden normal param sync'e **girmez**. Ancak `handleOscMessage` içinde filtre kontrolünden **önce** yakalanır.

### 7.3 Shared Types / Events Değişiklikleri

**`shared/src/events.ts`:**
```ts
// CLIENT_EVENT_TYPES'a ekle:
trackingBatch: 'tracking_batch'

// SERVER_EVENT_TYPES'a ekle:
trackingBatch: 'tracking_batch'
```

**`shared/src/types.ts`:**
```ts
export interface TrackerEntry {
  address: string       // "/tracking/trackers/head", "/tracking/trackers/1", vb.
  position: [number, number, number]  // X, Y, Z metre
  rotation: [number, number, number]  // X, Y, Z euler derece
}

export interface TrackingBatchPayload {
  ts: number
  trackers: TrackerEntry[]
}

export interface OutboundTrackingBatchPayload {
  roomCode: string
  sourceSessionId: string
  ts: number
  trackers: TrackerEntry[]
}
```

**`shared/src/types.ts` — RendererAppState'e ekle:**
```ts
trackingSendEnabled: boolean
trackingReceiveEnabled: boolean
```

**`shared/src/types.ts` — DesktopApi'ye ekle:**
```ts
toggleTrackingSend: (enabled: boolean) => Promise<void>
toggleTrackingReceive: (enabled: boolean) => Promise<void>
```

**`shared/src/constants.ts` — IPC_CHANNELS'a ekle:**
```ts
toggleTrackingSend: 'app:toggle-tracking-send'
toggleTrackingReceive: 'app:toggle-tracking-receive'
```

### 7.4 Backend Tracking Broadcast

`backend/src/lib/ws-handlers.ts` — yeni event handler:

```
handleTrackingBatch(ws, envelope):
  1. payload doğrula (isTrackingBatchPayload)
  2. ws.data.sessionId ve ws.data.roomCode kontrolü
  3. OutboundTrackingBatchPayload oluştur:
     { roomCode, sourceSessionId, ts, trackers }
  4. broadcastToRoom() ile tüm odaya gönder (sender hariç)
```

**Farklar (paramBatch'e kıyasla):**
- Rate limiting yok (bridge zaten 50ms throttle uyguluyor).
- Owner kontrolü yok (herkes tracking gönderebilir).
- Snapshot storage yok (tracking verisi anlık, geçmişi tutulmaz).
- Ayrı event tipi (`tracking_batch`) ile param verisiyle karışmaz.

`backend/src/lib/protocol.ts`'ye `isTrackingBatchPayload()` validator eklenir.

### 7.5 Receiver-Side OSC Output

Alıcı taraftaki Electron istemcisi, WebSocket'ten gelen `tracking_batch` event'ini VRChat'e OSC ile iletir.

**`osc-sync.ts` — yeni method:**
```ts
sendTrackingToVRChat(trackers: TrackerEntry[]): void
  // Her tracker için 2 OSC mesajı:
  // 1. {address}/position → 3 float arg (x, y, z)
  // 2. {address}/rotation → 3 float arg (x, y, z)
```

**VRChat OSC Tracker format:**
```
/tracking/trackers/head/position  → float x, float y, float z
/tracking/trackers/head/rotation  → float x, float y, float z
/tracking/trackers/1/position     → float x, float y, float z
/tracking/trackers/1/rotation     → float x, float y, float z
...
/tracking/trackers/8/position     → float x, float y, float z
/tracking/trackers/8/rotation     → float x, float y, float z
```

**Koşul:** `trackingReceiveEnabled === true` olmalı.

### 7.6 UI: Sync Tracking Card

`TrackingSyncSettingsCard.svelte` — `InputSyncSettingsCard` ile aynı yapıda collapsible card:

```
┌─────────────────────────────────────┐
│ 👤 Tracking Sync              [▼]  │
├─────────────────────────────────────┤
│ Sync full-body tracking data        │
│ between room members via OpenVR     │
│                                     │
│ Send My Tracking        [toggle]    │
│ ─────────────────────────────────── │
│ Receive Tracking        [toggle]    │
└─────────────────────────────────────┘
```

- **Send My Tracking:** Aktifken VRMode+TrackingType algılanırsa bridge'e `start` komutu gönderilir, bridge stdout verileri backend'e iletilir.
- **Receive Tracking:** Aktifken diğer kullanıcılardan gelen tracking batch'leri VRChat'e OSC ile yönlendirilir.

### 7.7 Electron Entegrasyon Akışı (tam)

**Sender tarafı:**
```
1. Kullanıcı "Send My Tracking" toggle'ını açar
2. trackingSendEnabled = true
3. OscSyncService VRMode=1 + TrackingType'ı 50ms pencerede algılar
4. bridge.startTracking() → stdin'e {"cmd":"start"}
5. Bridge stdout → JSON batch → backend.sendTrackingBatch()
6. Backend → broadcastToRoom(tracking_batch, sender hariç)
7. VRMode=0 algılanırsa → bridge.stopTracking() → stdin'e {"cmd":"stop"}
```

**Receiver tarafı:**
```
1. Kullanıcı "Receive Tracking" toggle'ını açar
2. trackingReceiveEnabled = true
3. WebSocket'ten tracking_batch gelir
4. oscSync.sendTrackingToVRChat(trackers) → port 9000'e OSC
5. VRChat avatar'da tracker pozisyonlarını uygular
```

### 7.8 Dosya Değişiklikleri Özeti

```
shared/src/
  ├── constants.ts        # +IPC_CHANNELS (tracking send/receive)
  ├── events.ts           # +tracking_batch event type
  └── types.ts            # +TrackerEntry, TrackingBatchPayload, RendererAppState, DesktopApi

backend/src/lib/
  ├── protocol.ts         # +isTrackingBatchPayload validator
  └── ws-handlers.ts      # +handleTrackingBatch handler

electron-app/src/
  ├── main/
  │   ├── index.ts        # +tracker bridge wiring, IPC handlers
  │   └── lib/
  │       ├── tracker-bridge.ts  # YENİ: child_process manager
  │       ├── osc-sync.ts        # +VRMode/TrackingType detection, +sendTrackingToVRChat
  │       ├── backend-client.ts  # +sendTrackingBatch, +onRemoteTrackingBatch
  │       └── app-state.ts       # +trackingSendEnabled/Receive state
  ├── preload/
  │   └── index.ts        # +toggleTrackingSend/Receive IPC
  └── renderer/src/lib/components/
      ├── TrackingSyncSettingsCard.svelte  # YENİ: UI card
      └── RoomScreen.svelte               # +TrackingSyncSettingsCard ekleme
```

## 8. Hedef Dışı Kapsam

- SteamVR başlatma (uygulama yalnızca mevcut vrserver.exe'ye bağlanır).
- Kalibrasyon UI'ı (ilk versiyon otomatik T-Pose snapshot).
- Tracker cihaz eşleştirme/sıralama UI'ı.
- Tracking verisi snapshot storage (anlık veri, geçmişi tutulmaz).
- Çoklu sender desteği (aynı anda birden fazla kişi tracking gönderemez — gelecek versiyon).
