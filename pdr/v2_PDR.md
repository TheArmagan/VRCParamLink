# VRCParamLink v2 PDR — Parametre Görüntüleme, Düzenleme ve Avatar Eşleştirme

## 1. Doküman Amacı

Bu doküman, VRCParamLink MVP sonrası ikinci aşama özelliklerini tanımlar. Kapsam: oda arayüzünde son parametrelerin listelenmesi, parametre tipine göre düzenleme kontrolleri, parametre başına sync toggle, avatar değişimi algılama ve avatar ID eşleştirmeli senkronizasyon.

## 2. Özellik Özeti

### 2.1 Parametre Listesi (Son 50)

- Oda ekranında gönderilmiş/alınmış son 50 parametre değeri gösterilecektir.
- Parametre listesi, en son güncellenen parametre en üstte olacak şekilde sıralanacaktır.
- Yeni bir parametre geldiğinde veya mevcut bir parametrenin değeri güncellendiğinde liste güncellenir.
- Toplam kayıt sayısı 50'yi aşarsa en eski güncellenen parametre listeden düşer.

### 2.2 Parametre Düzenleme Kontrolleri

Her parametre satırında parametre tipine göre uygun düzenleme kontrolü gösterilir:

| `valueType` | Kontrol | Detay |
|---|---|---|
| `bool` | Switch (toggle) | Açık/kapalı |
| `int` | Slider + sayısal değer | `0–255` aralığında slider, yanında sayı gösterimi |
| `float` | Slider + sayısal değer | `0.0–1.0` aralığında slider, 2 ondalık gösterim |

- Düzenleme kontrolleri yalnızca **owner** kullanıcı için aktif olacaktır.
- Owner olmayan kullanıcılar salt-okunur modda parametreleri görebilecektir.
- Owner bir parametreyi düzenlediğinde parametre değeri yerel OSC'ye gönderilir ve normal throttle akışıyla odaya yayılır.

### 2.3 Parametre Başına Sync Toggle

- Her parametre satırında ayrıca bir **sync switch** bulunur.
- Bu switch, ilgili parametrenin kullanıcının kendi avatarına uygulanıp uygulanmayacağını kontrol eder.
- Varsayılan olarak tüm parametreler sync **açık** başlar.
- Kullanıcı bir parametrenin sync'ini kapattığında, o parametreye ait gelen remote güncellemeler yerel OSC'ye gönderilmez.
- Sync toggle durumu istemci tarafında (main process) tutulur, sunucuya gönderilmez.
- Sync toggle yalnızca **owner olmayan** kullanıcılar için geçerlidir (owner zaten parametre kaynağıdır).

### 2.4 Avatar Değişimi Algılama (`/avatar/change`)

VRChat, avatar değiştiğinde `/avatar/change` OSC mesajı gönderir. Bu mesajın payload'ı avatar ID string'ini içerir.

Davranış:

1. İstemci `/avatar/change` mesajını yakalayınca:
   - Yerel parametre listesi (son 50) sıfırlanır.
   - Sync toggle durumları sıfırlanır (hepsi açık).
   - Yeni avatar ID sunucuya `avatar_change` WebSocket mesajıyla bildirilir.
2. Sunucu, avatar ID bilgisini oda bazında session'a kaydeder.
3. Sunucu, tüm odaya `avatar_id_updated` olayı yayınlar.

### 2.5 Avatar ID Eşleştirmeli Senkronizasyon

- Parametre senkronizasyonu yalnızca alıcının avatar ID'si ile owner'ın avatar ID'si eşleştiğinde gerçekleşir.
- Avatar ID eşleşiyorsa gelen `param_batch` verileri yerel OSC'ye uygulanır.
- Eşleşmiyorsa parametre listesi UI'da güncellenmeye devam eder fakat yerel OSC'ye yazılmaz.
- Avatar ID eşleşme durumu Renderer state'inde `avatarSyncActive` boolean olarak tutulur.
- UI'da senkronizasyon bölümünde avatar eşleşme durumu görselleştirilir.

### 2.6 Sync Bölümünde Aktif Parametre İsmi

- Oda ekranının sync durum bölümünde son sync edilen parametrenin kısa ismi (path'in son segmenti) gösterilir.
- Örnek: `/avatar/parameters/VRCEmote` → `VRCEmote`
- Gösterim anlık güncellenir: her gelen veya giden batch'in ilk parametresinin kısa ismi gösterilir.

## 3. Yeni/Değişen Veri Modelleri

### 3.1 `RendererAppState` Değişiklikleri

```ts
interface RendererAppState {
  // Mevcut alanlar aynen korunur
  // ...

  // v2 ek alanlar
  parameterList: ParamEntry[]         // Son 50 parametre
  lastSyncParamName: string | null    // Son sync edilen parametrenin kısa ismi
  selfAvatarId: string | null         // Kendi avatar ID'miz
  ownerAvatarId: string | null        // Owner'ın avatar ID'si
  avatarSyncActive: boolean           // Avatar ID eşleşme durumu
}
```

### 3.2 `ParamEntry` Tipi

```ts
interface ParamEntry {
  path: string
  valueType: ParamValueType
  value: boolean | number
  updatedAt: number
  syncEnabled: boolean  // yalnızca istemci tarafı, default: true
}
```

### 3.3 Avatar Change OSC Mesajı

- Adres: `/avatar/change`
- Tip: `string`
- Değer: VRChat avatar ID (örn. `avtr_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`)

## 4. Yeni WebSocket Olayları

### 4.1 `avatar_change` (İstemci → Sunucu)

```ts
type AvatarChangePayload = {
  avatarId: string
}
```

### 4.2 `avatar_id_updated` (Sunucu → İstemci)

```ts
type AvatarIdUpdatedPayload = {
  roomCode: string
  sessionId: string
  avatarId: string
}
```

## 5. Backend Değişiklikleri

### 5.1 Session'a Avatar ID Eklenmesi

- `vrcpl:session:{sessionId}` hash'ine `avatarId` alanı eklenir.
- `vrcpl:room:{roomCode}` hash'ine `ownerAvatarId` alanı eklenir (cache, hız için).
- Avatar change mesajı geldiğinde:
  1. Session'ın `avatarId` alanı güncellenir.
  2. Session owner ise `ownerAvatarId` de güncellenir.
  3. Tüm odaya `avatar_id_updated` yayınlanır.

### 5.2 `RoomJoinedPayload` Genişlemesi

```ts
interface RoomJoinedPayload {
  // Mevcut alanlar korunur
  ownerAvatarId: string | null  // Owner'ın avatar ID'si (join anında)
}
```

### 5.3 `Participant` Genişlemesi

```ts
interface Participant {
  // Mevcut alanlar korunur
  avatarId: string | null  // Katılımcının son bilinen avatar ID'si
}
```

## 6. Electron Main Process Değişiklikleri

### 6.1 OSC Dinleme: `/avatar/change`

- `OscSyncService`, `/avatar/change` adresini dinleyecek yeni bir callback alır: `onAvatarChange(avatarId: string)`.
- Normal parametre işleme `/avatar/change` adresini yok saymaya devam eder (bu bir parametre değil, özel bir olaydır).

### 6.2 App State: Parametre Listesi

- Main process, `ParamEntry[]` dizisini tutar (max 50, `updatedAt` azalan sıra).
- Her gelen veya giden parametre batch'inde liste güncellenir.
- Avatar change olayında liste sıfırlanır.

### 6.3 App State: Sync Toggle

- `Map<string, boolean>` olarak `syncToggles` tutulur (path → enabled).
- OscSyncService'de remote batch uygulaması sırasında bu map kontrol edilir.
- Sync kapalı olan path'ler yerel OSC'ye gönderilmez.

### 6.4 App State: Avatar Match

- `selfAvatarId` ve `ownerAvatarId` karşılaştırılarak `avatarSyncActive` hesaplanır.
- `avatarSyncActive = false` iken gelen remote batch'ler OSC'ye hiç uygulanmaz (UI'da görünmeye devam eder).

## 7. Renderer Değişiklikleri

### 7.1 Yeni Bileşen: `ParameterListCard`

- Collapsible card olarak oda ekranına eklenir.
- Her satırda:
  - Parametre kısa ismi (path'in son segmenti)
  - Parametre tipine uygun kontrol (slider/switch)
  - Sync toggle switch'i (owner olmayanlar için)
- Owner kullanıcılar düzenleme kontrollerini kullanabilir.
- Owner olmayan kullanıcılar salt-okunur kontroller + sync toggle görür.
- Parametre yoksa "No parameters received yet." mesajı gösterilir.

### 7.2 `SyncStatusCard` Genişlemesi

- Son sync edilen parametre isminin gösterimi.
- Avatar eşleşme durumu badge'i:
  - Eşleşme varsa: yeşil badge "Avatar Matched"
  - Eşleşme yoksa: sarı badge "Avatar Mismatch — sync paused"
  - Avatar ID henüz bilinmiyorsa: gri badge "Waiting for avatar"

### 7.3 IPC Eklentileri

`DesktopApi`'ye eklenenler:

```ts
interface DesktopApi {
  // Mevcut metodlar korunur
  toggleParamSync: (path: string, enabled: boolean) => Promise<void>
  editParam: (param: ParamValue) => Promise<void>
}
```

## 8. Akış Diyagramları

### 8.1 Remote Param Batch Akışı (Owner Olmayan Kullanıcı)

```
Backend → param_batch
  ↓
Main Process: parameterList güncelle (son 50)
  ↓
Main Process: avatarSyncActive kontrol
  ├─ false → OSC'ye gönderme, sadece UI güncelle
  └─ true → her param için syncToggles kontrol
               ├─ sync kapalı → OSC'ye gönderme
               └─ sync açık → OSC'ye gönder
  ↓
Renderer'a state yayınla
```

### 8.2 Avatar Change Akışı

```
VRChat → /avatar/change (avatarId)
  ↓
OscSyncService: onAvatarChange callback
  ↓
Main Process:
  1. parameterList sıfırla
  2. syncToggles sıfırla
  3. selfAvatarId güncelle
  4. avatarSyncActive yeniden hesapla
  5. Backend'e avatar_change gönder
  ↓
Backend:
  1. Session avatarId güncelle
  2. Owner ise ownerAvatarId güncelle
  3. Tüm odaya avatar_id_updated yayınla
  ↓
Diğer İstemciler:
  1. ownerAvatarId güncelle (owner değiştiyse)
  2. avatarSyncActive yeniden hesapla
```

### 8.3 Owner Parametre Düzenleme Akışı

```
UI: Kullanıcı slider/switch ile değer değiştir
  ↓
IPC: editParam(param)
  ↓
Main Process: OscSyncService.sendParamToOsc(param)
  ↓
OSC → VRChat (yerel avatar güncellenir)
  ↓
VRChat → OSC echo (suppress edilir)
  ↓
Normal throttle akışıyla batch olarak Backend'e gönderilir
```

## 9. Sabitler

```ts
const PARAM_LIST_MAX_SIZE = 50
const AVATAR_CHANGE_OSC_ADDRESS = '/avatar/change'
```

## 10. İmplementasyon Sırası

1. `shared`: Yeni tipler (`ParamEntry`, `AvatarChangePayload`, `AvatarIdUpdatedPayload`), event'ler ve sabitler.
2. `backend`: `avatar_change` handler, session/room avatar ID yönetimi, `avatar_id_updated` broadcast.
3. `electron-app/main`: `OscSyncService` avatar change algılama, `app-state` parametre listesi & sync toggle & avatar match, `backend-client` yeni event handling.
4. `electron-app/preload`: Yeni IPC kanalları (`toggleParamSync`, `editParam`).
5. `electron-app/renderer`: `ParameterListCard` bileşeni, `SyncStatusCard` genişlemesi, `RoomScreen` entegrasyonu.