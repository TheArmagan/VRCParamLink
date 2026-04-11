# VRCParamLink PDR

## 1. Doküman Amacı

Bu doküman, VRCParamLink uygulamasının MVP kapsamını, kullanıcı akışlarını, sistem davranışlarını ve teknik sınırlarını implementasyona hazır seviyede tanımlar. Amaç, geliştirme başlamadan önce frontend, Electron, OSC, WebSocket ve backend tarafındaki kararları tek bir yerde netleştirmektir.

## 2. Ürün Özeti

VRCParamLink, VRChat OSC API kullanarak bir odadaki aktif owner kullanıcının avatar parametrelerini aynı odadaki diğer kullanıcılara senkronize eden bir Windows masaüstü uygulamasıdır.

MVP kapsamında:

- İstemci uygulaması Electron tabanlı olacaktır.
- Renderer katmanı Svelte 5, shadcn-svelte ve Tailwind CSS v4 ile geliştirilecektir.
- Backend Bun ile geliştirilecektir.
- Tüm istemci-sunucu iletişimi WebSocket üzerinden yapılacaktır.
- HTTP API olmayacaktır.
- Redis, oda ve geçici durum verileri için kullanılacaktır.
- Sadece `/avatar` ile başlayan OSC adresleri desteklenecektir.

## 3. Problem Tanımı

VRChat içinde birden fazla kullanıcının avatar parametrelerini senkron tutmak için basit, düşük gecikmeli ve yönetilebilir bir araca ihtiyaç vardır. Hedef, owner tabanlı bir senkronizasyon modeli ile bir odadaki kullanıcıların aynı parametre durumunu paylaşabilmesidir.

## 4. Hedefler

- Kullanıcının kısa sürede oda oluşturabilmesi veya mevcut odaya katılabilmesi.
- Oda içinde tek bir aktif kaynak kullanıcı olması.
- Owner kullanıcının avatar parametre değişikliklerinin diğer katılımcılara güvenilir biçimde aktarılması.
- Ağ kullanımını azaltmak için parametre değişikliklerinin 150 ms pencere ile throttled biçimde gönderilmesi.
- Owner değişiminin hem manuel hem otomatik kurallarla yönetilebilmesi.
- Odanın boşaldığında otomatik silinmesi.
- Yeniden bağlanma halinde kullanıcının 10 saniyelik grace period içinde aynı oturuma dönebilmesi.

## 5. Hedef Dışı Kapsam

- HTTP REST API
- Mobil istemci
- Kalıcı kullanıcı hesabı sistemi
- VRChat hesabı ile resmi kimlik doğrulama entegrasyonu
- Uzun süreli kalıcı odalar
- Windows dışı platform desteği
- `/avatar` dışındaki OSC adreslerinin işlenmesi

## 6. Sistem Mimarisi

### 6.1 Electron İstemci Mimarisi

- `main` process, yerel OSC dinleme ve gönderme işlemlerini yönetir.
- `main` process, backend WebSocket bağlantısını yönetir.
- `main` process, room state ve bağlantı yaşam döngüsü için istemci domain katmanını barındırır.
- `preload` katmanı renderer ile main arasında tipli ve sınırlı IPC köprüsü sağlar.
- `renderer` katmanı yalnızca UI state, kullanıcı etkileşimleri ve görselleştirme ile ilgilenir.

### 6.2 Frontend Teknoloji Kararları

- UI framework: Svelte 5
- Component sistemi: shadcn-svelte
- Stil sistemi: Tailwind CSS v4
- Animasyon ve temel yardımcı sınıflar: `tw-animate-css`
- Uygulama pencere boyutu: `width = 400`, `height = 600`

### 6.3 Frontend Tasarım İlkeleri

- Ortak UI bileşenleri shadcn-svelte üzerinden oluşturulmalıdır.
- Form, dialog, switch, button, input, card, alert ve badge gibi tekrar eden öğeler özel elle değil öncelikle shadcn-svelte ile kurulmalıdır.
- Tema token'ları Tailwind ve CSS variable tabanlı olmalıdır.
- Renderer katmanı OSC soketi veya Node erişimini doğrudan kullanmamalıdır.
- Tasarım, küçük ve sabit boyutlu pencereye uygun kompakt bir desktop panel mantığı ile hazırlanmalıdır.
- Ana ekranlarda dikey akış, net bölümleme ve minimum scroll hedeflenmelidir.
- En kritik aksiyonlar ilk görünür alanda kalmalıdır.
- 400x600 alan içinde taşma üretmeyen, okunaklı ve dokunulabilir kontrol boyutları kullanılmalıdır.

### 6.4 Backend Mimarisi

- Backend, Bun WebSocket sunucusu olarak çalışacaktır.
- Oda oluşturma, join, owner değişimi, heartbeat, reconnect ve state yayınları tamamen WebSocket olayları ile yürütülecektir.
- Redis, oda state'i ve reconnect bilgisi için kullanılacaktır.
- Sunucu tek instance ile çalışabilecek şekilde basit tutulmalı, fakat state yönetimi Redis'e dayandığı için ileride yatay ölçeklemeye açık olmalıdır.

## 7. Hedef Kullanıcı Akışı

### 7.1 Uygulamaya Giriş

Kullanıcı uygulamayı açtığında kendisinden bir `displayName` istenir.

Ardından iki ana aksiyon sunulur:

- `Create Room`
- `Join Room`

### 7.2 Oda Oluşturma

`Create Room` seçildiğinde:

- Sistem yalnızca büyük harf ve rakamlardan oluşan 16 karakterlik bir room code üretir.
- Odayı oluşturan kullanıcı ilk owner olur.
- Oda varsayılan ayarları ile yaratılır.
- Kullanıcı odaya bağlanır ve oda ekranına alınır.

### 7.3 Odaya Katılma

`Join Room` seçildiğinde:

- Kullanıcı room code girer.
- Aynı oda içinde `displayName` tekil olmak zorundadır.
- Oda doluysa giriş reddedilir.
- Bağlantı başarılı ise kullanıcı odaya katılır.
- Katılır katılmaz mevcut owner'ın son tam state snapshot'ını alır.

### 7.4 Oda İçinde Display Name Değiştirme

- Kullanıcı oda içindeyken istediği zaman kendi `displayName` değerini değiştirebilir.
- Yeni `displayName`, aynı oda içinde başka bir kullanıcı tarafından kullanılmıyor olmalıdır.
- Değişiklik başarılı olduğunda tüm katılımcılara güncel isim bilgisi yayınlanır.

## 8. Oda Modeli

- Her odanın tek bir aktif owner'ı vardır.
- Oda kapasitesi MVP için en fazla 8 kullanıcıdır.
- Son kullanıcı odadan ayrıldığında oda ve ilişkili geçici veriler silinir.
- Kullanıcı bağlantısı koptuğunda 10 saniyelik grace period içinde aynı oturuma dönebilir.
- Room code karakter seti yalnızca `A-Z` ve `0-9` olacaktır.
- Kullanıcılar oda içindeyken kendi `displayName` değerlerini değiştirebilir.

### 8.1 Varsayılan Oda Ayarları

- `autoOwnerEnabled = false`
- `instantOwnerTakeoverEnabled = true`
- `filterMode = allow_all`
- `filterPaths = []`

## 9. Ownership Modeli

### 9.1 Temel Kural

- Senkronizasyon tek yönlüdür: `owner -> odadaki diğer herkes`.
- Aynı anda yalnızca owner kullanıcının parametre değişiklikleri kaynak kabul edilir.

### 9.2 Manuel Owner Değişimi

- Bir kullanıcının anında owner olup olamayacağı, odanın mevcut owner'ı tarafından açılıp kapatılabilen bir ayardır.
- Ayar açıksa diğer kullanıcı ownerlığı anında üstüne alabilir.
- Ayar kapalıysa manuel owner devri engellenir.

### 9.3 Auto-owner

- Oda ayarı olarak auto-owner açılıp kapatılabilir.
- Auto-owner açıkken owner olmayan bir kullanıcı yerel VRChat OSC tarafından tespit edilen geçerli bir parametre değişikliği üretirse ownerlık kendisine geçebilir.
- Çakışma durumunda son geçerli değişikliği sunucuya ulaştıran kullanıcı owner olur.

### 9.4 Owner Ayrılma Kuralı

- Owner odadan ayrılırsa ownerlık odadaki en eski aktif katılımcıya otomatik geçer.
- En eski aktif katılımcı, odaya en önce katılmış ve halen aktif durumda olan kullanıcıdır.

### 9.5 Owner Değişim Sonrası Davranış

- Owner değiştiğinde odadaki tüm istemcilere yeni owner bilgisi yayınlanır.
- Owner değişimi sonrası yeni owner'ın son bilinen state'i referans kabul edilir.
- Yeni owner'ın state cache'i boşsa istemci ilk geçerli parametre batch'i ile state üretmeye başlar.

## 10. Parametre Senkronizasyon Modeli

### 10.1 Desteklenen OSC Adresleri

- İstemci yalnızca `/avatar` ile başlayan OSC adreslerini işler.
- `/avatar` ile başlamayan tüm OSC mesajları yok sayılır.
- Backend, istemciden gelen parametre path'lerinin `/avatar` ile başlamasını zorunlu kılar.
- Whitelist/blacklist içine eklenen tüm path'ler de `/avatar` ile başlamak zorundadır.

### 10.2 Desteklenen Parametre Tipleri

MVP kapsamında aşağıdaki tipler desteklenir:

- `bool`
- `int`
- `float`

String ve null tabanlı OSC payload'ları senkronizasyon kapsamı dışındadır.

### 10.3 Parametre Veri Modeli

Her parametre kaydı aşağıdaki şekildedir:

```ts
type ParamValue = {
	path: string
	valueType: 'bool' | 'int' | 'float'
	value: boolean | number
}
```

Kurallar:

- `path` benzersiz anahtardır.
- Aynı batch içinde aynı `path` birden fazla kez varsa yalnızca son kayıt dikkate alınır.
- `valueType = int` olduğunda `value` tam sayı olmalıdır.
- `valueType = float` olduğunda `value` sayı olmalıdır.
- `valueType = bool` olduğunda `value` boolean olmalıdır.

### 10.4 Throttle Kuralı

- İstemci, yerel parametre değişikliklerini 150 ms pencere içinde toplar.
- Aynı parametre bu pencere içinde birden çok kez değişirse yalnızca son değer tutulur.
- Her 150 ms sonunda değişen parametrelerin tek bir toplu payload'ı gönderilir.
- Boş batch gönderilmez.

### 10.5 Filtreleme

- Whitelist/blacklist oda bazlı çalışacaktır.
- Oda filtresi yalnızca mevcut owner tarafından seçilip değiştirilebilir.
- Oda içindeki tüm katılımcılar aynı whitelist/blacklist konfigürasyonuna tabi olur.

Filtre modları:

- `allow_all`: `/avatar` ile başlayan tüm geçerli parametreler kabul edilir.
- `whitelist`: yalnızca listedeki path'ler kabul edilir.
- `blacklist`: listedeki path'ler hariç tüm geçerli path'ler kabul edilir.

### 10.6 Join Sonrası Durum

- Yeni katılan kullanıcıya mevcut owner'ın son tam state snapshot'ı gönderilir.
- Snapshot sonrasında kullanıcı sadece artımlı güncellemeleri almaya devam eder.

## 11. Frontend Gereksinimleri

### 11.0 Pencere ve Layout Gereksinimleri

- Ana uygulama penceresi sabit olarak `400x600` boyutunda çalışacaktır.
- Arayüz küçük pencere için optimize edilmelidir; responsive web sayfası gibi değil, kompakt masaüstü araç paneli gibi davranmalıdır.
- Giriş ekranı ve oda ekranı aynı pencere boyutunda rahat kullanılabilir olmalıdır.
- Header, içerik ve alt aksiyon alanları net ayrılmalıdır.
- Oda ekranında kritik bilgiler üst bölümde toplanmalıdır: room code, owner bilgisi, bağlantı durumu.
- Katılımcı listesi ve filtre ayarları sınırlı alanı verimli kullanacak şekilde card, tabs, accordion veya sheet benzeri shadcn-svelte desenleriyle sunulmalıdır.
- Uzun listeler için kontrollü scroll alanı kullanılmalı, tüm pencerenin rastgele scroll etmesi önlenmelidir.

### 11.1 Giriş Ekranı

- `displayName` alanı
- `Create Room` butonu
- `Join Room` butonu
- `Join Room` akışında room code alanı
- Form validasyonları
- Bağlantı kuruluyor ve hata durumlarını gösteren UI alanı
- Giriş ekranı tek bakışta anlaşılır olmalı, ana aksiyonlar pencerenin ilk görünür alanında yer almalıdır.

### 11.2 Oda Ekranı

- Oda kodunun gösterimi
- Katılımcı listesi
- Mevcut owner bilgisinin gösterimi
- Kendi `displayName` değerini düzenleme aksiyonu
- Auto-owner durumunun gösterimi ve kontrolü
- Manuel owner alma aksiyonu
- Owner'ın diğerlerinin ownerlığı anında alabilmesini açıp kapatabildiği ayar
- Owner tarafından yönetilen oda bazlı whitelist/blacklist kontrolü
- Bağlantı durumu ve hata mesajları
- Reconnect veya sync problemi olduğunda kullanıcıya görünür durum bileşeni
- Yoğun kontroller için kademeli açılan alanlar kullanılmalı, tek ekrana aşırı bilgi yüklenmemelidir.
- Oda ekranı 400x600 içinde kullanılabilir kalmalı; kritik owner ve sync kontrolleri scroll altında kaybolmamalıdır.

### 11.3 Renderer State Gereksinimleri

Renderer tarafında en az şu state tutulmalıdır:

- `displayName`
- `sessionStatus`
- `roomCode`
- `participantList`
- `ownerSessionId`
- `autoOwnerEnabled`
- `instantOwnerTakeoverEnabled`
- `filterMode`
- `filterPaths`
- `connectionState`
- `lastSyncAt`
- `errorState`

## 12. Electron Süreç Sorumlulukları

### 12.1 Main Process

- OSC listener ve sender ömrünü yönetir.
- WebSocket client bağlantısını yönetir.
- Reconnect, heartbeat ve throttle domain mantığını yönetir.
- Renderer'a yalnızca ihtiyaç duyduğu normalize edilmiş state'i gönderir.

### 12.2 Preload

- Renderer için açık bir API yüzeyi sağlar.
- Event subscribe mekanizmasını tipli hale getirir.
- Rastgele IPC kanal erişimini engeller.

### 12.3 Renderer

- Kullanıcı aksiyonlarını toplar.
- Main process'ten gelen state değişikliklerini gösterir.
- Ağ veya OSC protokol detaylarını doğrudan bilmez.

## 13. Backend Gereksinimleri

### 13.1 Teknoloji Kararları

- Runtime: Bun
- İletişim: Bun WebSocket
- Veri deposu: Redis
- Protokol: yalnızca WebSocket

### 13.2 Genel Kurallar

- Backend üzerinde HTTP API bulunmayacaktır.
- Oda oluşturma, odaya katılma, owner değişimi, heartbeat, reconnect ve state aktarımı dahil tüm akışlar WebSocket mesajları üzerinden yönetilecektir.
- Redis key pattern'leri ve diğer sabitler tek bir constants dosyasında tutulmalıdır.
- Prefix, TTL değerleri, event isimleri ve limitler dağınık biçimde tanımlanmamalıdır.

### 13.3 Sunucu Sorumlulukları

- Oda oluşturmak ve silmek
- Room code benzersizliği sağlamak
- Katılımcı üyeliğini yönetmek
- Owner state ve room ayarlarını korumak
- Parametre batch doğrulamak, filtrelemek ve fan-out yapmak
- Reconnect grace period ve session resume davranışını yönetmek
- Hataları standart error kodları ile döndürmek

## 14. WebSocket Protokolü

### 14.1 Mesaj Zarfı

İstemci ve sunucu arasındaki tüm mesajlar aşağıdaki ortak zarf yapısını kullanmalıdır:

```ts
type SocketMessage<TPayload = unknown> = {
	type: string
	requestId?: string
	ts: number
	payload: TPayload
}
```

Kurallar:

- `type` zorunludur.
- `ts` istemci veya sunucu üretim zamanıdır.
- `requestId` istemci istekleri için önerilir ve yanıt hata mesajlarına geri yazılır.
- JSON dışında payload formatı kullanılmayacaktır.

### 14.2 İstemci -> Sunucu Olayları

#### `hello`

Amaç: istemci oturumunu açmak veya resume etmek.

```ts
type HelloPayload = {
	displayName: string
	clientVersion: string
	resumeSessionId?: string
	resumeRoomCode?: string
}
```

#### `create_room`

Amaç: yeni oda yaratmak ve istemciyi odaya almak.

```ts
type CreateRoomPayload = {
	settings?: {
		autoOwnerEnabled?: boolean
		instantOwnerTakeoverEnabled?: boolean
		filterMode?: 'allow_all' | 'whitelist' | 'blacklist'
		filterPaths?: string[]
	}
}
```

#### `join_room`

Amaç: mevcut odaya katılmak.

```ts
type JoinRoomPayload = {
	roomCode: string
}
```

#### `leave_room`

Amaç: istemcinin odadan bilinçli şekilde ayrılması.

```ts
type LeaveRoomPayload = {}
```

#### `set_display_name`

Amaç: kullanıcının oda içindeyken kendi display name bilgisini değiştirmesi.

```ts
type SetDisplayNamePayload = {
	displayName: string
}
```

#### `take_owner`

Amaç: mevcut ayarlar izin veriyorsa ownerlığı almak.

```ts
type TakeOwnerPayload = {}
```

#### `set_room_settings`

Amaç: auto-owner, instant takeover ve filter ayarlarını değiştirmek.

```ts
type SetRoomSettingsPayload = {
	autoOwnerEnabled?: boolean
	instantOwnerTakeoverEnabled?: boolean
	filterMode?: 'allow_all' | 'whitelist' | 'blacklist'
	filterPaths?: string[]
}
```

#### `param_batch`

Amaç: owner istemcinin throttled parametre güncellemesini sunucuya iletmesi.

```ts
type ParamBatchPayload = {
	batchSeq: number
	params: ParamValue[]
}
```

#### `heartbeat`

Amaç: bağlantının canlı olduğunu bildirmek.

```ts
type HeartbeatPayload = {
	roomCode?: string
}
```

### 14.3 Sunucu -> İstemci Olayları

#### `hello_ack`

```ts
type HelloAckPayload = {
	sessionId: string
	reconnectGraceMs: number
	heartbeatIntervalMs: number
	heartbeatTimeoutMs: number
	resumed: boolean
}
```

#### `room_joined`

```ts
type RoomJoinedPayload = {
	roomCode: string
	selfSessionId: string
	ownerSessionId: string
	settings: {
		autoOwnerEnabled: boolean
		instantOwnerTakeoverEnabled: boolean
		filterMode: 'allow_all' | 'whitelist' | 'blacklist'
		filterPaths: string[]
	}
	participants: Array<{
		sessionId: string
		displayName: string
		joinedAt: number
		connected: boolean
	}>
	snapshot: ParamValue[]
}
```

#### `room_state`

Amaç: tam room state senkronu veya yeniden hesaplanan state yayını.

```ts
type RoomStatePayload = RoomJoinedPayload
```

#### `room_settings_updated`

```ts
type RoomSettingsUpdatedPayload = {
	roomCode: string
	updatedBySessionId: string
	settings: {
		autoOwnerEnabled: boolean
		instantOwnerTakeoverEnabled: boolean
		filterMode: 'allow_all' | 'whitelist' | 'blacklist'
		filterPaths: string[]
	}
}
```

#### `participant_joined`

```ts
type ParticipantJoinedPayload = {
	roomCode: string
	participant: {
		sessionId: string
		displayName: string
		joinedAt: number
		connected: boolean
	}
}
```

#### `participant_left`

```ts
type ParticipantLeftPayload = {
	roomCode: string
	sessionId: string
	displayName: string
	reason: 'leave' | 'disconnect' | 'expired'
}
```

#### `display_name_updated`

```ts
type DisplayNameUpdatedPayload = {
	roomCode: string
	sessionId: string
	previousDisplayName: string
	displayName: string
}
```

#### `owner_changed`

```ts
type OwnerChangedPayload = {
	roomCode: string
	ownerSessionId: string
	previousOwnerSessionId: string | null
	reason: 'manual' | 'auto_owner' | 'owner_left' | 'resume_conflict'
}
```

#### `param_batch`

Amaç: owner kaynaklı değişikliklerin odadaki diğer istemcilere yayılması.

```ts
type OutboundParamBatchPayload = {
	roomCode: string
	sourceSessionId: string
	batchSeq: number
	params: ParamValue[]
}
```

#### `error`

```ts
type ErrorPayload = {
	code: string
	message: string
	requestId?: string
	details?: unknown
}
```

## 15. Redis Veri Modeli

Tüm Redis key'leri `vrcpl:` prefix'i ile başlamalıdır.

| Key | Tip | Amaç | TTL |
| --- | --- | --- | --- |
| `vrcpl:room:{roomCode}` | hash veya json | Oda meta verisi ve ayarlar | oda aktif oldukça yok |
| `vrcpl:room:{roomCode}:participants` | hash veya json | Katılımcı listesi | oda aktif oldukça yok |
| `vrcpl:room:{roomCode}:join-order` | zset | Owner fallback için katılım sırası | oda aktif oldukça yok |
| `vrcpl:room:{roomCode}:state` | hash | Son snapshot, `path -> serialized ParamValue` | oda aktif oldukça yok |
| `vrcpl:room:{roomCode}:display:{displayName}` | string | Aynı isim kontrolü, rename ve resume yardımı | aktif session boyunca, disconnect sonrası 10 sn |
| `vrcpl:session:{sessionId}` | hash veya json | Session, room ve bağlantı durumu | aktifken yok, disconnect sonrası 10 sn |

### 15.1 Room Meta Alanları

Oda meta kaydında en az şu alanlar bulunmalıdır:

- `roomCode`
- `ownerSessionId`
- `createdAt`
- `autoOwnerEnabled`
- `instantOwnerTakeoverEnabled`
- `filterMode`
- `filterPaths`
- `participantCount`

### 15.2 Session Alanları

Session kaydında en az şu alanlar bulunmalıdır:

- `sessionId`
- `displayName`
- `roomCode`
- `joinedAt`
- `connected`
- `lastSeenAt`

## 16. Doğrulama ve İş Kuralları

### 16.1 Display Name

- Boş olamaz.
- Trimlenmiş olarak değerlendirilir.
- Aynı oda içinde tekil olmak zorundadır.
- Kullanıcı oda içindeyken kendi `displayName` değerini değiştirebilir.
- Display name güncellendiğinde eski isim key'i serbest bırakılmalı, yeni isim key'i atomik biçimde ayrılmalıdır.
- Resume başarılı ise aynı `displayName` mevcut session ile eşleştirilir.

### 16.2 Room Code

- Uzunluk tam 16 olmalıdır.
- Sadece büyük harf ve rakam içermelidir.
- İstemci küçük harf girse bile join öncesi büyük harfe normalize edilmelidir.

### 16.3 Parametre Doğrulaması

- `path` `/avatar` ile başlamalıdır.
- `valueType` desteklenen tiplerden biri olmalıdır.
- `filterMode` ve `filterPaths` kurallarına uymayan parametreler elenmelidir.
- Owner olmayan kullanıcılardan gelen `param_batch` normal koşulda reddedilmelidir.
- Auto-owner açıksa owner olmayan kullanıcının geçerli batch'i owner değişimini tetikleyebilir.

### 16.4 Room Settings Doğrulaması

- `set_room_settings` yalnızca owner tarafından çağrılabilir.
- `filterPaths` içindeki her öğe `/avatar` ile başlamalıdır.
- `filterPaths` tekrar eden kayıt içermemelidir.

## 17. Heartbeat ve Reconnect Davranışı

- Sunucu `heartbeatIntervalMs = 5000` ve `heartbeatTimeoutMs = 10000` döndürmelidir.
- İstemci her 5 saniyede bir `heartbeat` göndermelidir.
- 10 saniye içinde heartbeat alınmazsa bağlantı kopmuş kabul edilir.
- Kopan kullanıcı 10 saniyelik grace period içinde `resumeSessionId` ve `resumeRoomCode` ile yeniden bağlanabilir.
- Resume başarılıysa kullanıcı yeni participant olarak eklenmez, mevcut session devam eder.
- Resume süresi dolmuşsa kullanıcı yeniden normal join akışına dönmelidir.

## 18. Hata Kodları

MVP için en az aşağıdaki hata kodları tanımlanmalıdır:

- `INVALID_MESSAGE`
- `UNSUPPORTED_EVENT`
- `DISPLAY_NAME_REQUIRED`
- `DISPLAY_NAME_IN_USE`
- `DISPLAY_NAME_UPDATE_FAILED`
- `INVALID_ROOM_CODE`
- `ROOM_NOT_FOUND`
- `ROOM_FULL`
- `NOT_IN_ROOM`
- `NOT_OWNER`
- `OWNER_TAKEOVER_DISABLED`
- `INVALID_FILTER_MODE`
- `INVALID_FILTER_PATH`
- `INVALID_PARAM_PATH`
- `UNSUPPORTED_PARAM_TYPE`
- `PAYLOAD_TOO_LARGE`
- `RATE_LIMITED`
- `SESSION_NOT_RESUMABLE`

## 19. Constants Dosyası Gereksinimi

Backend ve istemci tarafında dağınık sabit tanımı yapılmamalıdır. En az aşağıdaki sabitler ortak ve merkezi biçimde tanımlanmalıdır:

- `REDIS_PREFIX = 'vrcpl:'`
- `ROOM_CODE_LENGTH = 16`
- `ROOM_CODE_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'`
- `ROOM_MAX_PARTICIPANTS = 8`
- `PARAM_BATCH_INTERVAL_MS = 150`
- `RECONNECT_GRACE_MS = 10000`
- `HEARTBEAT_INTERVAL_MS = 5000`
- `HEARTBEAT_TIMEOUT_MS = 10000`
- `SUPPORTED_OSC_PREFIX = '/avatar'`

## 20. İmplementasyon Sırası

Önerilen uygulama sırası aşağıdaki gibidir:

1. Shared types ve constants katmanını oluştur.
2. Backend WebSocket event şemalarını ve doğrulama katmanını yaz.
3. Redis room ve session repository katmanını yaz.
4. Owner, room settings, reconnect ve heartbeat domain servislerini yaz.
5. Electron main process içinde OSC listener ve WebSocket client orkestrasyonunu yaz.
6. Preload bridge ile renderer API yüzeyini tanımla.
7. Renderer tarafında giriş ve oda ekranlarını shadcn-svelte bileşenleri ile kur.
8. Son olarak join snapshot, param batch ve owner değişim akışlarını entegre et.

## 21. MVP Kabul Kriterleri

- Kullanıcı `displayName` ile oda oluşturabilmelidir.
- Kullanıcı geçerli room code ile mevcut odaya katılabilmelidir.
- Aynı oda içinde duplicate `displayName` engellenmelidir.
- Kullanıcı oda içindeyken kendi `displayName` değerini değiştirebilmeli ve değişiklik tüm katılımcılara yansımalıdır.
- Owner'ın `/avatar` ile başlayan geçerli parametreleri 150 ms toplu batch olarak diğer kullanıcılara aktarılmalıdır.
- `/avatar` dışındaki OSC mesajları hiçbir aşamada senkronize edilmemelidir.
- Yeni katılan kullanıcı owner'ın son snapshot state'ini almalıdır.
- Owner değişimi manuel, auto-owner ve owner ayrılması durumlarında doğru çalışmalıdır.
- Owner ayrılırsa ownerlık en eski aktif kullanıcıya geçmelidir.
- Whitelist/blacklist yalnızca owner tarafından değiştirilebilmelidir.
- Reconnect grace period içinde kullanıcı aynı session'a dönebilmelidir.
- Son kullanıcı odadan ayrıldığında oda Redis'ten temizlenmelidir.
- Giriş ve oda ekranları `400x600` pencere boyutunda kullanılabilir ve görsel olarak dengeli olmalıdır.

## 22. Kesinleşen MVP Kararları

- Platform: Windows desktop
- İstemci stack: Electron + Svelte 5 + shadcn-svelte + Tailwind CSS v4
- Uygulama pencere boyutu: 400x600 sabit
- Backend stack: Bun + WebSocket + Redis
- Room code: 16 karakter, yalnızca büyük harf ve rakam
- Oda kapasitesi: 8 kullanıcı
- Grace period: 10 saniye
- Yeni owner seçimi: odadaki en eski aktif kullanıcı
- Filtreleme modeli: oda bazlı whitelist/blacklist, yönetim yetkisi owner'da
- Senkronizasyon modeli: owner snapshot + artımlı batch
- Desteklenen OSC kapsamı: yalnızca `/avatar` ile başlayan path'ler

## 23. Teknik Görev Listesi

Bu bölüm, implementasyonun doğrudan planlanabilmesi için faz bazlı teknik görevleri tanımlar.

### 23.1 Faz 1: Shared Contracts ve Constants

Amaç: backend, Electron main ve renderer tarafından ortak kullanılacak veri sözleşmelerini netleştirmek.

Görevler:

1. Ortak bir `shared` katmanı oluştur.
2. Socket event isimlerini tek yerde tanımla.
3. `ParamValue`, room settings, participant, room state ve error payload tiplerini çıkar.
4. Redis key builder fonksiyonlarını merkezi constants katmanına al.
5. Room code, heartbeat, reconnect ve throttle sabitlerini ortaklaştır.

Done kriteri:

- Ortak tipler backend ve Electron tarafında yeniden tanımsız kullanılabiliyor olmalı.
- Event isimleri string literal dağınıklığı olmadan merkezi kaynaktan tüketiliyor olmalı.

### 23.2 Faz 2: Backend WebSocket Foundation

Amaç: Bun tabanlı WebSocket sunucusunun temelini kurmak.

Görevler:

1. Bun WebSocket server bootstrap yapısını kur.
2. Bağlantı açılışı, kapanışı ve mesaj parse akışını yaz.
3. Ortak mesaj zarfı doğrulamasını ekle.
4. `hello`, `heartbeat` ve `error` temel akışlarını çalışır hale getir.
5. Standart loglama ve temel payload boyutu koruması ekle.

Done kriteri:

- Sunucu geçerli ve geçersiz mesajları ayırt edebilmeli.
- Hata durumlarında standart `error` payload dönebilmeli.

### 23.3 Faz 3: Redis Repository Katmanı

Amaç: room, participant, session ve state verisini Redis üzerinde tutarlı yönetmek.

Görevler:

1. Redis client bağlantısını kur.
2. Room repository oluştur.
3. Session repository oluştur.
4. Participant ve join-order repository fonksiyonlarını yaz.
5. Room state snapshot repository fonksiyonlarını yaz.
6. Display name reservation ve rename işlemleri için atomik yardımcı operasyonları yaz.

Done kriteri:

- Room create, join, leave, resume ve rename senaryoları Redis seviyesinde tutarlı çalışmalı.
- `vrcpl:` prefix dışı key oluşmamalı.

### 23.4 Faz 4: Room ve Session Domain Servisleri

Amaç: ürün davranışlarını backend domain kuralları ile uygulamak.

Görevler:

1. `create_room` akışını yaz.
2. `join_room` akışını yaz.
3. `leave_room` akışını yaz.
4. `set_display_name` akışını yaz.
5. Session resume akışını yaz.
6. Son kullanıcı ayrıldığında room cleanup akışını yaz.

Done kriteri:

- Duplicate display name engellenmeli.
- Kullanıcı oda içindeyken ismini değiştirebilmeli.
- Resume başarısında aynı session geri dönmeli.

### 23.5 Faz 5: Ownership ve Room Settings Domain

Amaç: owner değişimi ve oda ayarlarını iş kurallarına uygun yönetmek.

Görevler:

1. `take_owner` akışını yaz.
2. Owner ayrıldığında en eski aktif kullanıcıya geçiş kuralını uygula.
3. `set_room_settings` akışını yaz.
4. Auto-owner davranışını backend seviyesinde destekle.
5. `owner_changed` ve `room_settings_updated` broadcast akışlarını yaz.

Done kriteri:

- Manual owner alma yalnızca ayar açıksa çalışmalı.
- Owner ayrıldığında fallback owner deterministik seçilmeli.
- Filter ayarları sadece owner tarafından değiştirilebilmeli.

### 23.6 Faz 6: Parametre Senkronizasyon Domain

Amaç: owner kaynaklı parametre değişikliklerini doğrulayıp dağıtmak.

Görevler:

1. `param_batch` doğrulamasını yaz.
2. `/avatar` prefix kontrolünü uygula.
3. `bool`, `int`, `float` dışı tipleri reddet.
4. Whitelist/blacklist filtrelemesini uygula.
5. Oda snapshot state güncellemesini yap.
6. Geçerli batch'leri diğer katılımcılara fan-out et.

Done kriteri:

- Geçersiz parametreler snapshot'a yazılmamalı.
- `/avatar` dışı path'ler hiçbir durumda broadcast edilmemeli.
- Yeni katılan kullanıcı son snapshot'ı eksiksiz alabilmeli.

### 23.7 Faz 7: Electron Main Process Client Domain

Amaç: yerel OSC ve uzak WebSocket akışlarını desktop istemcide birleştirmek.

Görevler:

1. OSC listener yaşam döngüsünü yönet.
2. Gelen OSC mesajlarında `/avatar` filtresi uygula.
3. Yerel parametre cache ve 150 ms batch mekanizmasını yaz.
4. Backend WebSocket client bağlantısını kur.
5. Reconnect ve heartbeat yönetimini yaz.
6. Gelen room state ve param batch verilerini yerel OSC send akışına bağla.

Done kriteri:

- Yerel owner kullanıcının değişiklikleri 150 ms batch ile sunucuya gönderilmeli.
- Sunucudan gelen geçerli parametreler yerel OSC sender ile uygulanabilmeli.

### 23.8 Faz 8: Preload API Katmanı

Amaç: renderer ile main process arasında güvenli ve tipli arayüz sağlamak.

Görevler:

1. Join, create room, leave room, display name update, owner alma ve room settings update metodlarını expose et.
2. Renderer için state update subscribe mekanizması tanımla.
3. Error ve bağlantı durumu event'lerini expose et.

Done kriteri:

- Renderer, Node veya Electron internallerine doğrudan erişmeden tüm ihtiyacı olan aksiyonları kullanabilmeli.

### 23.9 Faz 9: Renderer UI

Amaç: 400x600 pencereye uygun üretim kalitesinde masaüstü arayüzünü kurmak.

Görevler:

1. Giriş ekranını shadcn-svelte bileşenleri ile kur.
2. Oda ekranını kompakt layout ile kur.
3. Katılımcı listesi görünümünü oluştur.
4. Display name düzenleme akışını ekle.
5. Owner kontrollerini ekle.
6. Oda bazlı whitelist/blacklist yönetim UI'ını ekle.
7. Hata, loading, reconnect ve sync durumu bileşenlerini ekle.

Done kriteri:

- Giriş ekranı ve oda ekranı 400x600 içinde taşma oluşturmadan kullanılabilir olmalı.
- Kritik aksiyonlar ilk görünür alanda kalmalı.

### 23.10 Faz 10: Test ve Stabilizasyon

Amaç: MVP davranışlarını doğrulamak ve kırılgan noktaları kapatmak.

Görevler:

1. Room create/join/leave akışlarını test et.
2. Reconnect ve resume akışlarını test et.
3. Display name rename çakışmalarını test et.
4. Owner fallback ve auto-owner akışlarını test et.
5. Filter modları ve `/avatar` kısıtını test et.
6. 2 ila 8 kullanıcı senaryolarında broadcast davranışını test et.

Done kriteri:

- PDR kabul kriterlerinin tamamı doğrulanmış olmalı.
- Kritik hata kodları beklenen senaryolarda dönüyor olmalı.

## 24. Task Breakdown Önerisi

İlk sprint için önerilen kırılım:

1. Shared types + constants
2. Backend socket foundation
3. Redis repositories
4. Room create/join/leave/resume
5. Display name rename

İkinci sprint için önerilen kırılım:

1. Ownership domain
2. Room settings ve filter domain
3. Param batch validation + fan-out
4. Snapshot state yönetimi

Üçüncü sprint için önerilen kırılım:

1. Electron main orchestration
2. Preload API
3. Renderer giriş ekranı
4. Renderer oda ekranı
5. Reconnect, error ve sync UX

## 25. Definition Of Done

Bir faz tamamlandı sayılmadan önce aşağıdakiler sağlanmalıdır:

1. PDR'da tanımlanan davranışlar kod seviyesinde karşılanmış olmalı.
2. İlgili event ve payload tipleri shared katmanda tanımlanmış olmalı.
3. Hata senaryoları standart error kodları ile dönüyor olmalı.
4. Yeni davranış renderer state'ine doğru yansıyor olmalı.
5. Manuel doğrulama veya otomatik test ile akış doğrulanmış olmalı.
