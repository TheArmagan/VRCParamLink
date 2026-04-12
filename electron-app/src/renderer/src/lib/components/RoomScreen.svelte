<script lang="ts">
  import type {
    FilterMode,
    ParamValue,
    RendererAppState,
  } from "../../../../../../shared/src/index.ts";
  import FilterSettingsCard from "./FilterSettingsCard.svelte";
  import InputSyncSettingsCard from "./InputSyncSettingsCard.svelte";
  import TrackingSyncSettingsCard from "./TrackingSyncSettingsCard.svelte";
  import OwnerControlsCard from "./OwnerControlsCard.svelte";
  import ParameterListCard from "./ParameterListCard.svelte";
  import ParticipantsCard from "./ParticipantsCard.svelte";
  import RoomSummaryCard from "./RoomSummaryCard.svelte";
  import SyncStatusCard from "./SyncStatusCard.svelte";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Separator } from "$lib/components/ui/separator/index.js";

  let {
    appState,
    displayNameDraft = $bindable(""),
    uiMessage = "",
    onSaveDisplayName = () => {},
    onLeaveRoom = () => {},
    onTakeOwner = () => {},
    onToggleParamSync = (_path: string, _enabled: boolean) => {},
    onToggleLocalPlayback = (_enabled: boolean) => {},
    onToggleInputSend = (_enabled: boolean) => {},
    onToggleInputReceive = (_enabled: boolean) => {},
    onToggleTrackingSend = (_enabled: boolean) => {},
    onToggleTrackingReceive = (_enabled: boolean) => {},
    onEditParam = (_targetSessionId: string, _param: ParamValue) => {},
    onSendAllParams = () => {},
    onSaveRoomSettings = (
      _filterMode: FilterMode,
      _filterPathsText: string,
      _filterBlacklistPathsText: string,
      _autoOwnerEnabled: boolean,
      _instantOwnerTakeoverEnabled: boolean,
    ) => {},
  }: {
    appState: RendererAppState;
    displayNameDraft?: string;
    uiMessage?: string;
    onSaveDisplayName?: () => void;
    onLeaveRoom?: () => void;
    onTakeOwner?: () => void;
    onToggleParamSync?: (path: string, enabled: boolean) => void;
    onToggleLocalPlayback?: (enabled: boolean) => void;
    onToggleInputSend?: (enabled: boolean) => void;
    onToggleInputReceive?: (enabled: boolean) => void;
    onToggleTrackingSend?: (enabled: boolean) => void;
    onToggleTrackingReceive?: (enabled: boolean) => void;
    onEditParam?: (targetSessionId: string, param: ParamValue) => void;
    onSendAllParams?: () => void;
    onSaveRoomSettings?: (
      filterMode: FilterMode,
      filterPathsText: string,
      filterBlacklistPathsText: string,
      autoOwnerEnabled: boolean,
      instantOwnerTakeoverEnabled: boolean,
    ) => void;
  } = $props();

  let isOwner = $derived(
    Boolean(
      appState.selfSessionId &&
      appState.selfSessionId === appState.ownerSessionId,
    ),
  );

  let filterModeDraft: FilterMode = $state(appState.filterMode);
  let filterPathsDraft = $state(appState.filterPaths.join("\n"));
  let filterBlacklistPathsDraft = $state(
    appState.filterBlacklistPaths.join("\n"),
  );
  let autoOwnerDraft = $state(appState.autoOwnerEnabled);
  let instantOwnerDraft = $state(appState.instantOwnerTakeoverEnabled);

  // Only sync drafts when the server-side values actually change
  let lastSyncedFilterMode: FilterMode | null = $state(null);
  let lastSyncedFilterPaths: string | null = $state(null);
  let lastSyncedFilterBlacklistPaths: string | null = $state(null);
  let lastSyncedAutoOwner: boolean | null = $state(null);
  let lastSyncedInstantOwner: boolean | null = $state(null);

  $effect(() => {
    if (!appState.roomCode) return;

    if (appState.filterMode !== lastSyncedFilterMode) {
      filterModeDraft = appState.filterMode;
      lastSyncedFilterMode = appState.filterMode;
    }

    const serverPaths = appState.filterPaths.join("\n");
    if (serverPaths !== lastSyncedFilterPaths) {
      filterPathsDraft = serverPaths;
      lastSyncedFilterPaths = serverPaths;
    }

    const serverBlacklistPaths = appState.filterBlacklistPaths.join("\n");
    if (serverBlacklistPaths !== lastSyncedFilterBlacklistPaths) {
      filterBlacklistPathsDraft = serverBlacklistPaths;
      lastSyncedFilterBlacklistPaths = serverBlacklistPaths;
    }

    if (appState.autoOwnerEnabled !== lastSyncedAutoOwner) {
      autoOwnerDraft = appState.autoOwnerEnabled;
      lastSyncedAutoOwner = appState.autoOwnerEnabled;
    }

    if (appState.instantOwnerTakeoverEnabled !== lastSyncedInstantOwner) {
      instantOwnerDraft = appState.instantOwnerTakeoverEnabled;
      lastSyncedInstantOwner = appState.instantOwnerTakeoverEnabled;
    }
  });
</script>

<section class="flex flex-1 flex-col gap-2.5 overflow-y-auto p-3">
  <Card.Root size="sm" class="overflow-visible border-border bg-card">
    <Card.Content class="grid gap-3">
      <RoomSummaryCard
        state={appState}
        bind:displayNameDraft
        {onSaveDisplayName}
        {onLeaveRoom}
      />

      <Separator />

      <ParticipantsCard
        participants={appState.participantList}
        ownerSessionId={appState.ownerSessionId}
        selfSessionId={appState.selfSessionId}
        participantParams={appState.participantParams}
        {onEditParam}
      />

      <SyncStatusCard state={appState} />

      <ParameterListCard
        parameters={appState.parameterList}
        {isOwner}
        selfSessionId={appState.selfSessionId}
        localPlaybackEnabled={appState.localPlaybackEnabled}
        onToggleSync={onToggleParamSync}
        {onToggleLocalPlayback}
        {onEditParam}
        {onSendAllParams}
      />

      <Separator />

      <OwnerControlsCard
        {isOwner}
        autoOwnerEnabled={autoOwnerDraft}
        instantOwnerTakeoverEnabled={instantOwnerDraft}
        canTakeOwner={Boolean(appState.participantList.length > 1)}
        {onTakeOwner}
        onToggleAutoOwner={(enabled) => {
          autoOwnerDraft = enabled;
          onSaveRoomSettings(
            filterModeDraft,
            filterPathsDraft,
            filterBlacklistPathsDraft,
            enabled,
            instantOwnerDraft,
          );
        }}
        onToggleInstantOwner={(enabled) => {
          instantOwnerDraft = enabled;
          onSaveRoomSettings(
            filterModeDraft,
            filterPathsDraft,
            filterBlacklistPathsDraft,
            autoOwnerDraft,
            enabled,
          );
        }}
      />

      <FilterSettingsCard
        {isOwner}
        bind:filterMode={filterModeDraft}
        bind:filterPathsText={filterPathsDraft}
        bind:filterBlacklistPathsText={filterBlacklistPathsDraft}
        onSave={(nextFilterMode, nextFilterPathsText, nextBlacklistPathsText) =>
          onSaveRoomSettings(
            nextFilterMode,
            nextFilterPathsText,
            nextBlacklistPathsText,
            autoOwnerDraft,
            instantOwnerDraft,
          )}
      />

      <InputSyncSettingsCard
        inputSendEnabled={appState.inputSendEnabled}
        inputReceiveEnabled={appState.inputReceiveEnabled}
        {onToggleInputSend}
        {onToggleInputReceive}
      />

      <TrackingSyncSettingsCard
        trackingSendEnabled={appState.trackingSendEnabled}
        trackingReceiveEnabled={appState.trackingReceiveEnabled}
        {onToggleTrackingSend}
        {onToggleTrackingReceive}
      />
    </Card.Content>
  </Card.Root>

  {#if uiMessage}
    <p class="px-1 text-xs leading-5 text-muted-foreground">
      {uiMessage}
    </p>
  {/if}
</section>
