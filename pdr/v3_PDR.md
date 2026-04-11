# VRCParamLink v3 PDR — Uzaktan Parametre Düzenleme ve Katılımcı Bazlı Parametre Geçmişi

## 1. Doküman Amacı

Bu doküman, VRCParamLink v2 sonrası üçüncü aşama özelliklerini tanımlar. Kapsam: odadaki herhangi bir kullanıcının herhangi bir diğer kullanıcının avatar parametrelerini düzenleyebilmesi (owner kısıtlaması olmadan), katılımcı bazlı parametre geçmişi, ve "Send All Parameters" resync butonu.

## 2. Özellik Özeti

### 2.1 Uzaktan Parametre Düzenleme (Remote Param Edit)

- Odadaki **tüm kullanıcılar**, diğer kullanıcıların avatar parametrelerini uygulama arayüzünden düzenleyebilir.
- Bu özellik owner/non-owner ayrımı gözetmez — herkes herkesi kontrol edebilir.
- Avatar mismatch durumunda bile parametreler değiştirilebilir.
- Yeni `remote_param_edit` WebSocket olayı ile çalışır:
  - **İstemci → Sunucu**: `{ targetSessionId, params: ParamValue[] }`
  - **Sunucu → Tüm Oda**: `{ roomCode, sourceSessionId, targetSessionId, params }` — sunucu hedef katılımcının aynı odada olduğunu doğrular ve mesajı tüm odaya broadcast eder.
  - **Hedef İstemci**: `targetSessionId === selfSessionId` ise parametreler yerel OSC'ye uygulanır.

### 2.2 Katılımcı Bazlı Parametre Geçmişi

- `RendererAppState` içinde `participantParams: Record<string, ParamEntry[]>` alanı eklenir.
- Her katılımcının gönderdiği parametreler `sessionId` bazında ayrı ayrı izlenir.
- `param_batch` geldiğinde `sourceSessionId` kullanılarak ilgili katılımcının parametre listesi güncellenir.
- `remote_param_edit` geldiğinde `targetSessionId` kullanılarak hedef katılımcının parametre listesi güncellenir.
- Katılımcı odadan ayrıldığında (`participant_left`) ilgili parametre kaydı silinir.
- Her katılımcı için en fazla 50 parametre saklanır (PARAM_LIST_MAX_SIZE).

### 2.3 Katılımcı Listesi Arayüz Güncellemesi

- `ParticipantsCard` bileşeni artık her katılımcı için **açılır (collapsible)** bir parametre listesi gösterir.
- Açıldığında o katılımcıya ait tüm parametreler (bool switch, int/float slider ile) düzenlenebilir hâlde listelenir.
- Herhangi bir kullanıcı, herhangi bir başka kullanıcının parametresini bu listeden değiştirebilir.
- Parametre düzenleme işlemi `remote_param_edit` olayı olarak sunucuya iletilir.

### 2.4 Parametre Listesi Kontrol Güncellemesi

- `ParameterListCard` bileşenindeki parametreler artık **tüm kullanıcılar** tarafından düzenlenebilir (eski: yalnızca owner).
- Bool switch, int slider, float slider kontrolleri herkes için aktif hâle getirildi (`disabled={!isOwner}` kaldırıldı).
- `editParam` çağrısı artık `targetSessionId` parametresi alır — ParameterListCard kendine ait parametreler için `selfSessionId` kullanır.

### 2.5 "Send All Parameters" Resync Butonu

- `ParameterListCard` bileşenine **"Send All Parameters"** butonu eklenir.
- Butona basıldığında kullanıcının mevcut `parameterList` içindeki tüm parametreler sunucuya `param_batch` olarak gönderilir.
- Bu, yeni katılan kullanıcıların veya senkronizasyon kayıplarının giderilmesi için tam bir resync sağlar.
- Buton yalnızca parametre listesinde en az bir parametre varken aktiftir.

## 3. Protokol Değişiklikleri

### 3.1 Yeni Olay: `remote_param_edit`

| Yön | Olay Tipi | Payload |
|---|---|---|
| Client → Server | `remote_param_edit` | `RemoteParamEditPayload { targetSessionId: string, params: ParamValue[] }` |
| Server → All Clients | `remote_param_edit` | `OutboundRemoteParamEditPayload { roomCode, sourceSessionId, targetSessionId, params }` |

- Sunucu tarafında owner kontrolü yapılmaz — herkes gönderebilir.
- Hedef `targetSessionId`'nin gönderenle aynı odada olması zorunludur; değilse hata döner.
- Gönderilen parametreler `normalizeParams()` ile normalize edilir.

### 3.2 Güncellenen Tipler

- `OutboundParamBatchPayload`: Opsiyonel `forceApply?: boolean` alanı eklendi (gelecekte avatar sync bypass için).
- `DesktopApi.editParam`: İmza `(targetSessionId: string, param: ParamValue)` olarak güncellendi.
- `DesktopApi.sendRemoteParamEdit`: Yeni metot — `(targetSessionId: string, params: ParamValue[])`.
- `DesktopApi.sendAllParams`: Yeni metot — parametre listesindeki tüm değerleri resync olarak gönderir.

### 3.3 Yeni IPC Kanalları

| Kanal | Açıklama |
|---|---|
| `app:send-remote-param-edit` | Belirli bir kullanıcının parametrelerini uzaktan düzenle |
| `app:send-all-params` | Tüm yerel parametreleri sunucuya gönder (resync) |

## 4. Veri Akışı

### 4.1 Kullanıcı A, Kullanıcı B'nin Parametresini Düzenler

1. A, ParticipantsCard'da B'nin parametre listesini açar.
2. A, B'nin bir parametresinin switch/slider'ını değiştirir.
3. İstemci A → Sunucu: `remote_param_edit { targetSessionId: B, params: [...] }`
4. Sunucu: B'nin aynı odada olduğunu doğrular, tüm odaya broadcast eder.
5. İstemci B: `targetSessionId === selfSessionId` koşulunu sağlar → parametreyi yerel OSC'ye uygular.
6. Tüm istemciler: `participantParams[B]` güncellenir, arayüz yenilenir.

### 4.2 Send All Parameters (Resync)

1. Kullanıcı "Send All Parameters" butonuna basar.
2. İstemci, `parameterList` içindeki tüm `ParamEntry` değerlerini `ParamValue[]`'e dönüştürür.
3. İstemci → Sunucu: `param_batch { batchSeq: 0, params: [...] }`
4. Sunucu normal `param_batch` akışıyla odaya broadcast eder.

## 5. Dosya Değişiklikleri Özeti

| Dosya | Değişiklik |
|---|---|
| `shared/src/events.ts` | `remoteParamEdit` client ve server event eklendi |
| `shared/src/types.ts` | `RemoteParamEditPayload`, `OutboundRemoteParamEditPayload`, `participantParams` RendererAppState'e eklendi, `DesktopApi` güncellendi |
| `shared/src/constants.ts` | `sendRemoteParamEdit`, `sendAllParams` IPC kanalları eklendi |
| `backend/src/lib/protocol.ts` | `isRemoteParamEditPayload` validator eklendi |
| `backend/src/lib/room-manager.ts` | `handleRemoteParamEdit` metodu eklendi |
| `backend/src/lib/ws-handlers.ts` | `remote_param_edit` handler eklendi |
| `electron-app/src/main/lib/app-state.ts` | `participantParams` state, `applyRemoteParamEdit`, `updateParticipantParams` eklendi |
| `electron-app/src/main/lib/backend-client.ts` | `sendRemoteParamEdit` metodu, `onRemoteParamEdit` callback, server event handler eklendi |
| `electron-app/src/main/index.ts` | `editParam` güncellendi, `sendRemoteParamEdit`, `sendAllParams` IPC handler eklendi |
| `electron-app/src/preload/index.ts` | Yeni API metotları expose edildi |
| `electron-app/src/renderer/.../App.svelte` | Yeni fonksiyonlar wire edildi |
| `electron-app/src/renderer/.../RoomScreen.svelte` | Yeni prop'lar eklendi |
| `electron-app/src/renderer/.../ParticipantsCard.svelte` | Collapsible per-participant parametre listesi ile yeniden yazıldı |
| `electron-app/src/renderer/.../ParameterListCard.svelte` | Owner kısıtlaması kaldırıldı, "Send All Parameters" butonu eklendi |