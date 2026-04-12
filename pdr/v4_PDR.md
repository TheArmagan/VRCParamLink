# VRCParamLink v4 PDR — /input Parametre Senkronizasyonu

## 1. Doküman Amacı

Bu doküman, VRCParamLink v3 sonrası dördüncü aşama özelliklerini tanımlar. Kapsam: VRChat OSC `/input/*` parametrelerinin odadaki kullanıcılar arasında senkronize edilmesi, kullanıcı bazlı alım/gönderim kontrolleri ve düşük gecikmeli (throttle'sız) iletim.

**Referans:** https://docs.vrchat.com/docs/osc-as-input-controller

## 2. VRChat /input Parametreleri Hakkında

VRChat, `/input/Name` formatında OSC mesajlarını hareket, bakış, buton gibi kontrol girdileri olarak kabul eder. İki türü vardır:

### 2.1 Axes (Float, -1 ile 1 arası)

| Adres | Açıklama |
|---|---|
| `/input/Vertical` | İleri (1) / Geri (-1) hareket |
| `/input/Horizontal` | Sağ (1) / Sol (-1) hareket |
| `/input/LookHorizontal` | Sağa/Sola bakış |
| `/input/UseAxisRight` | Sağ el kullanım ekseni |
| `/input/GrabAxisRight` | Sağ el tutma ekseni |
| `/input/MoveHoldFB` | Tutulan nesneyi ileri/geri |
| `/input/SpinHoldCwCcw` | Tutulan nesneyi saat yönü/ters |
| `/input/SpinHoldUD` | Tutulan nesneyi yukarı/aşağı |
| `/input/SpinHoldLR` | Tutulan nesneyi sol/sağ |

### 2.2 Buttons (Int, 1 = basılı, 0 = bırakıldı)

| Adres | Açıklama |
|---|---|
| `/input/MoveForward` | İleri hareket |
| `/input/MoveBackward` | Geri hareket |
| `/input/MoveLeft` | Sola strafe |
| `/input/MoveRight` | Sağa strafe |
| `/input/LookLeft` | Sola dön |
| `/input/LookRight` | Sağa dön |
| `/input/Jump` | Zıpla |
| `/input/Run` | Koş |
| `/input/ComfortLeft` | Snap-Turn sol (VR) |
| `/input/ComfortRight` | Snap-Turn sağ (VR) |
| `/input/DropRight` | Sağ el bırak (VR) |
| `/input/UseRight` | Sağ el kullan (VR) |
| `/input/GrabRight` | Sağ el tut (VR) |
| `/input/DropLeft` | Sol el bırak (VR) |
| `/input/UseLeft` | Sol el kullan (VR) |
| `/input/GrabLeft` | Sol el tut (VR) |
| `/input/PanicButton` | Safe Mode aç |
| `/input/QuickMenuToggleLeft` | QuickMenu sol toggle |
| `/input/QuickMenuToggleRight` | QuickMenu sağ toggle |
| `/input/Voice` | Ses toggle |

## 3. Özellik Özeti

### 3.1 /input Parametre Senkronizasyonu

- Mevcut sistemde yalnızca `/avatar` prefix'li OSC path'leri desteklenmektedir (`SUPPORTED_OSC_PREFIX = '/avatar'`). Bu güncelleme ile `/input/*` path'leri de senkronizasyon kapsamına alınır.
- `/input` parametreleri mevcut `param_batch` altyapısı üzerinden iletilir; ancak **farklı bir throttle politikası** uygulanır.
- `/input` parametreleri `parameterList` veya `participantParams`'a **eklenmez** — bunlar anlık kontrol girdileridir, parametre geçmişi tutulmaz.

### 3.2 Düşük Gecikmeli İletim (No Throttle)

- Mevcut `/avatar` parametreleri `PARAM_BATCH_INTERVAL_MS` (100ms) aralıkla toplanıp gönderilir; rapid param'lar ise `RAPID_PARAM_THROTTLE_MS` (2s) ile throttle edilir.
- **`/input` parametreleri bu throttle mekanizmasından muaftır.** Alındığı anda (next tick / immediate flush) sunucuya gönderilir.
- Sunucu tarafında da `/input` parametreleri adaptive throttling'den (ParamThrottleBuffer / ParamRateTracker) muaftır — anında broadcast edilir.
- Yeni bir event tipi eklenmez; mevcut `param_batch` event'i kullanılır. İstemci ve sunucu, batch içindeki path'lerin `/input/` ile başlayıp başlamadığını kontrol ederek davranış belirler.

### 3.3 Kullanıcı Arayüzü: Gelen Input Sync Ayarları

Her kullanıcı, **her bir /input parametresinin kendisine uygulanıp uygulanmayacağını** ayrı ayrı seçebilir. Bunun için yeni bir **InputSyncSettingsCard** bileşeni eklenir:

- VRChat'in desteklediği tüm `/input` parametreleri listelenmiş hâlde gösterilir (sabit liste, yukarıdaki tablolardan).
- Her parametrenin yanında bir **switch** bulunur (varsayılan: **kapalı** — güvenlik nedeniyle input sync opt-in olmalıdır).
- Kullanıcı, hangi input'ların uzaktan kendisine uygulanacağını seçer.
- Bu ayarlar yalnızca **gelen** (incoming) input'ları filtreler; gönderim tarafını etkilemez.
- Ayarlar yerel olarak saklanır (state), sunucuya gönderilmez.

### 3.4 Kullanıcı Arayüzü: Input Gönderim Switchi

- Yeni bir **"Send My Inputs"** global switch eklenir (varsayılan: **kapalı**).
- Bu switch kapalıyken kullanıcının yerel `/input` OSC mesajları sunucuya **gönderilmez**.
- Bu switch açıkken kullanıcının tüm yerel `/input` mesajları anında sunucuya iletilir.
- Mevcut `localPlaybackEnabled` switch'inden bağımsız çalışır; yalnızca `/input` gönderimini kontrol eder.

## 4. Mimari Değişiklikler

### 4.1 Sabitler (shared/src/constants.ts)

```ts
export const INPUT_OSC_PREFIX = '/input/'

/** Tüm desteklenen VRChat /input parametreleri */
export const VRC_INPUT_AXES: readonly string[] = [
  '/input/Vertical',
  '/input/Horizontal',
  '/input/LookHorizontal',
  '/input/UseAxisRight',
  '/input/GrabAxisRight',
  '/input/MoveHoldFB',
  '/input/SpinHoldCwCcw',
  '/input/SpinHoldUD',
  '/input/SpinHoldLR'
] as const

export const VRC_INPUT_BUTTONS: readonly string[] = [
  '/input/MoveForward',
  '/input/MoveBackward',
  '/input/MoveLeft',
  '/input/MoveRight',
  '/input/LookLeft',
  '/input/LookRight',
  '/input/Jump',
  '/input/Run',
  '/input/ComfortLeft',
  '/input/ComfortRight',
  '/input/DropRight',
  '/input/UseRight',
  '/input/GrabRight',
  '/input/DropLeft',
  '/input/UseLeft',
  '/input/GrabLeft',
  '/input/PanicButton',
  '/input/QuickMenuToggleLeft',
  '/input/QuickMenuToggleRight',
  '/input/Voice'
] as const

export const VRC_ALL_INPUTS: readonly string[] = [...VRC_INPUT_AXES, ...VRC_INPUT_BUTTONS] as const
```

`isSupportedOscPath` güncellenir:

```ts
export function isSupportedOscPath(path: string): boolean {
  return path.startsWith(SUPPORTED_OSC_PREFIX) || path.startsWith(INPUT_OSC_PREFIX)
}
```

Yeni yardımcı:

```ts
export function isInputOscPath(path: string): boolean {
  return path.startsWith(INPUT_OSC_PREFIX)
}
```

### 4.2 Tipler (shared/src/types.ts)

```ts
/** Kullanıcının hangi /input path'lerini almak istediği */
export type InputSyncToggles = Record<string, boolean>

export interface RendererAppState {
  // ... mevcut alanlar ...
  inputSendEnabled: boolean          // Kendi input'larını gönderme switchi
  inputSyncToggles: InputSyncToggles // Her /input path için alım switchi
}

export interface DesktopApi {
  // ... mevcut metotlar ...
  toggleInputSend: (enabled: boolean) => Promise<void>
  toggleInputSync: (path: string, enabled: boolean) => Promise<void>
}
```

### 4.3 IPC Kanalları (shared/src/constants.ts)

```ts
export const IPC_CHANNELS = {
  // ... mevcut kanallar ...
  toggleInputSend: 'app:toggle-input-send',
  toggleInputSync: 'app:toggle-input-sync'
} as const
```

## 5. Veri Akışı

### 5.1 Giden /input Akışı (Yerel → Sunucu)

1. OscSyncService, `/input/*` OSC mesajı alır.
2. `inputSendEnabled` kontrol edilir — kapalıysa mesaj drop edilir.
3. Mesaj throttle buffer'a **eklenmez** — doğrudan `onLocalInputBatch(params)` callback ile anında gönderilir.
4. BackendClient, `param_batch` event'i olarak sunucuya iletir.

### 5.2 Sunucu Tarafı İşleme

1. Sunucu `param_batch` alır.
2. Batch içindeki parametreler ayrıştırılır:
   - `/input/*` path'li parametreler: **throttle bypass** — anında tüm odaya broadcast edilir.
   - `/avatar/*` path'li parametreler: mevcut adaptive throttle mekanizması uygulanır.
3. Tek bir batch hem `/input` hem `/avatar` parametreleri içerebilir; sunucu bunları ayırır ve her grubu kendi kuralıyla işler.

### 5.3 Gelen /input Akışı (Sunucu → Yerel)

1. İstemci `param_batch` alır (outbound).
2. Batch içindeki `/input/*` parametreleri için:
   - `inputSyncToggles[path]` kontrol edilir — `true` ise OSC'ye gönderilir.
   - `parameterList`'e veya `participantParams`'a **eklenmez**.
3. Batch içindeki `/avatar/*` parametreleri mevcut akışla işlenmeye devam eder.

### 5.4 Örnek: Kullanıcı A zıplar, Kullanıcı B'de uygulanır

1. A'nın VRChat'i `/input/Jump 1` OSC mesajı gönderir.
2. A'nın istemcisi: `inputSendEnabled === true` → anında sunucuya `param_batch` gönderir.
3. Sunucu: `/input/Jump` path'i → throttle bypass → anında odaya broadcast.
4. B'nin istemcisi: `inputSyncToggles['/input/Jump'] === true` → `/input/Jump 1` OSC mesajını yerel VRChat'e gönderir.
5. B'nin VRChat'inde karakter zıplar.
6. A'nın VRChat'i `/input/Jump 0` gönderir → aynı akış tekrarlanır (release).

## 6. OscSyncService Değişiklikleri

### 6.1 handleOscMessage Güncelleme

```ts
private handleOscMessage(message: OSCMessage): void {
  // Avatar change — mevcut davranış
  if (message.address === AVATAR_CHANGE_OSC_ADDRESS) { /* ... */ return }

  // /input path'leri — ayrı akış
  if (isInputOscPath(message.address)) {
    if (!this.options.isInputSendEnabled?.()) return
    const param = this.mapOscMessageToParam(message)
    if (!param) return
    // Anında gönder, throttle yok
    void this.options.onLocalInputBatch?.([param])
    return
  }

  // /avatar path'leri — mevcut davranış
  if (!isSupportedOscPath(message.address) || isBuiltinVrcParam(message.address)) { return }
  // ... mevcut throttle akışı ...
}
```

### 6.2 applyRemoteBatch Güncelleme

```ts
applyRemoteBatch(payload: OutboundParamBatchPayload): void {
  for (const param of payload.params) {
    if (isInputOscPath(param.path)) {
      // Input param — inputSyncToggles kontrolü
      if (this.options.isInputSyncEnabled?.(param.path)) {
        this.sendParamToOsc(param)
      }
      continue
    }
    // Avatar param — mevcut shouldApplyRemoteParam kontrolü
    if (shouldApplyRemoteParam(param.path)) {
      this.sendParamToOsc(param)
    }
  }
}
```

### 6.3 Yeni Callback'ler (OscSyncOptions)

```ts
type OscSyncOptions = {
  // ... mevcut callback'ler ...
  onLocalInputBatch?: (params: ParamValue[]) => Promise<void> | void
  isInputSendEnabled?: () => boolean
  isInputSyncEnabled?: (path: string) => boolean
}
```

## 7. Sunucu (Backend) Değişiklikleri

### 7.1 RoomManager.handleParamBatch Güncelleme

```ts
async handleParamBatch(sessionId: string, payload: ParamBatchPayload): Promise<HandleParamBatchResult | null> {
  // ... mevcut doğrulamalar ...

  const inputParams: ParamValue[] = []
  const avatarParams: ParamValue[] = []

  for (const param of normalizedParams) {
    if (isInputOscPath(param.path)) {
      inputParams.push(param)
    } else {
      avatarParams.push(param)
    }
  }

  let result: HandleParamBatchResult | null = null

  // Avatar params — mevcut adaptive throttle akışı
  if (avatarParams.length > 0) {
    result = await this.processAvatarParams(sessionId, roomCode, avatarParams, payload.batchSeq)
  }

  // Input params — anında broadcast, throttle yok
  if (inputParams.length > 0) {
    const inputOutbound: OutboundParamBatchPayload = {
      roomCode,
      sourceSessionId: sessionId,
      batchSeq: payload.batchSeq,
      params: inputParams
    }
    // Anında dön, result'a ekle
    if (!result) {
      result = { outboundPayload: inputOutbound, ownerChangedPayload: null }
    } else {
      // İkinci bir broadcast gerekli — ws-handlers'da iki broadcast yapılır
      result.inputOutboundPayload = inputOutbound
    }
  }

  return result
}
```

### 7.2 HandleParamBatchResult Güncelleme (room-types.ts)

```ts
export interface HandleParamBatchResult {
  outboundPayload: OutboundParamBatchPayload | null
  ownerChangedPayload: OwnerChangedPayload | null
  inputOutboundPayload?: OutboundParamBatchPayload | null  // Yeni
}
```

### 7.3 normalizeParams Güncelleme (room-helpers.ts)

`normalizeParams` fonksiyonu `/input/*` path'lerini de geçerli kabul etmelidir (mevcut `isSupportedOscPath` güncellemesi ile otomatik çözülür).

### 7.4 Input Parametreleri ve Auto-Owner

- `/input` parametreleri **auto-owner** tetikleme mantığından muaf tutulur.
- `ParamRateTracker`'da `/input` path'leri kaydedilmez.
- Yalnızca `/input` içeren batch'ler auto-owner'ı tetiklemez.

## 8. Electron App State Değişiklikleri

### 8.1 Yeni State Alanları

```ts
// app-state.ts — state objesine eklenecek
inputSendEnabled: false,
inputSyncToggles: {}  // Varsayılan: tüm input'lar kapalı (opt-in)
```

### 8.2 Yeni Fonksiyonlar

```ts
export function setInputSendEnabled(enabled: boolean): void {
  state.inputSendEnabled = enabled
}

export function isInputSendEnabled(): boolean {
  return state.inputSendEnabled
}

export function setInputSyncToggle(path: string, enabled: boolean): void {
  state.inputSyncToggles = { ...state.inputSyncToggles, [path]: enabled }
}

export function isInputSyncEnabled(path: string): boolean {
  return state.inputSyncToggles[path] ?? false  // Varsayılan kapalı
}
```

### 8.3 applyRemoteBatch Güncelleme

`applyRemoteBatch` fonksiyonunda `/input` path'li parametreler `parameterList`'e ve `participantParams`'a **eklenmez**. Yalnızca OSC'ye iletilir (yukarıdaki akışla).

## 9. Arayüz Bileşenleri

### 9.1 InputSyncSettingsCard (Yeni Bileşen)

`RoomScreen`'e eklenen yeni bir kart bileşeni:

- **Başlık:** "Input Sync"
- **Açıklama:** "Control which /input commands are synced from other users"
- **"Send My Inputs" Switch:** Kullanıcının kendi input'larını odaya gönderip göndermeyeceği (varsayılan: kapalı).
- **Gelen Input Listesi:** VRChat'in desteklediği tüm `/input` path'leri iki grup hâlinde (Axes / Buttons) listelenir.
- Her path'in yanında bir **switch** bulunur (varsayılan: kapalı).
- Switch açıkken o path'ten gelen input'lar yerel VRChat'e uygulanır.
- "Enable All" / "Disable All" shortcut butonları eklenir.
- Kart **collapsible** olabilir (uzun liste nedeniyle).

### 9.2 RoomScreen Entegrasyonu

- `InputSyncSettingsCard`, `FilterSettingsCard` yakınına eklenir.
- `inputSendEnabled` ve `inputSyncToggles` prop olarak geçirilir.

## 10. Güvenlik Değerlendirmesi

### 10.1 Varsayılan Kapalı (Opt-In)

- Hem gönderim (`inputSendEnabled`) hem alım (`inputSyncToggles`) varsayılan **kapalıdır**.
- Bu, kullanıcının haberi olmadan input kontrolünün ele geçirilmesini önler.
- Kullanıcı bilinçli olarak hangi input'ları kabul edeceğini seçer.

### 10.2 Potansiyel Riskler

- `/input/PanicButton`, `/input/Voice` gibi hassas input'lar kötüye kullanılabilir — UI'da bu parametrelerin yanına uyarı ikonu eklenebilir.
- Hareket input'ları (`Vertical`, `Horizontal`, `MoveForward` vb.) sürekli olarak gönderilirse bant genişliği artabilir — ancak throttle olmadığı için batch boyutu genellikle küçük kalır (1-2 param).

### 10.3 Chatbox Hariç Tutma

- `/chatbox/input` ve `/chatbox/typing` path'leri bu kapsama **dahil değildir**. Yalnızca `/input/*` prefix'i desteklenir.

## 11. Dosya Değişiklikleri Özeti

| Dosya | Değişiklik |
|---|---|
| `shared/src/constants.ts` | `INPUT_OSC_PREFIX`, `VRC_INPUT_AXES`, `VRC_INPUT_BUTTONS`, `VRC_ALL_INPUTS` sabitleri; `isSupportedOscPath` ve `isInputOscPath` fonksiyonları güncelleme/ekleme; yeni IPC kanalları |
| `shared/src/types.ts` | `InputSyncToggles` tipi, `RendererAppState`'e `inputSendEnabled` ve `inputSyncToggles` alanları, `DesktopApi`'ye `toggleInputSend` ve `toggleInputSync` metotları |
| `backend/src/lib/room-manager.ts` | `handleParamBatch` input/avatar ayrıştırması, input parametreleri için throttle bypass |
| `backend/src/lib/room-types.ts` | `HandleParamBatchResult`'a `inputOutboundPayload` alanı |
| `backend/src/lib/room-helpers.ts` | `normalizeParams` — `/input` path desteği (isSupportedOscPath değişikliği ile) |
| `backend/src/lib/ws-handlers.ts` | `handleParamBatch` — çift broadcast desteği (avatar + input ayrı) |
| `electron-app/src/main/lib/app-state.ts` | `inputSendEnabled`, `inputSyncToggles` state ve yardımcı fonksiyonlar; `applyRemoteBatch`'de input param filtreleme |
| `electron-app/src/main/lib/osc-sync.ts` | `handleOscMessage` input ayrıştırma; `applyRemoteBatch` input sync kontrolü; yeni callback'ler |
| `electron-app/src/main/lib/backend-client.ts` | `sendInputBatch` — input parametreleri için ayrı gönderim metodu |
| `electron-app/src/main/index.ts` | `toggleInputSend`, `toggleInputSync` IPC handler'ları |
| `electron-app/src/preload/index.ts` | Yeni API metotları expose |
| `electron-app/src/renderer/.../App.svelte` | Yeni fonksiyonlar wire |
| `electron-app/src/renderer/.../RoomScreen.svelte` | `InputSyncSettingsCard` ekleme |
| `electron-app/src/renderer/.../InputSyncSettingsCard.svelte` | **Yeni bileşen** — input sync ayarları UI |
