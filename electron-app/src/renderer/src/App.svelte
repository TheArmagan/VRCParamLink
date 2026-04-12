<script lang="ts">
  import { onMount } from "svelte";
  import type {
    FilterMode,
    ParamValue,
    RendererAppState,
  } from "../../../../shared/src/index.ts";
  import AppHeader from "./lib/components/AppHeader.svelte";
  import RoomScreen from "./lib/components/RoomScreen.svelte";
  import WelcomeScreen from "./lib/components/WelcomeScreen.svelte";
  import "./app.css";

  let appState: RendererAppState = $state({
    appName: "VRCParamLink",
    appVersion: "",
    screen: "welcome",
    selfSessionId: null,
    displayName: localStorage.getItem("vrcpl:displayName") ?? "",
    roomCode: "",
    participantList: [],
    ownerSessionId: null,
    autoOwnerEnabled: false,
    instantOwnerTakeoverEnabled: true,
    filterMode:
      (localStorage.getItem("vrcpl:filterMode") as FilterMode) ?? "allow_all",
    filterPaths: JSON.parse(localStorage.getItem("vrcpl:filterPaths") ?? "[]"),
    filterBlacklistPaths: JSON.parse(
      localStorage.getItem("vrcpl:filterBlacklistPaths") ?? "[]",
    ),
    connectionState: "idle",
    sessionStatus: "idle",
    lastSyncAt: null,
    lastSyncDirection: null,
    lastBatchSize: 0,
    lastBatchSourceSessionId: null,
    sentBatchCount: 0,
    receivedBatchCount: 0,
    errorState: null,
    parameterList: [],
    lastSyncParamName: null,
    selfAvatarId: null,
    ownerAvatarId: null,
    avatarSyncActive: false,
    localPlaybackEnabled: true,
    participantParams: {},
    inputSendEnabled: false,
    inputReceiveEnabled: false,
  });

  let displayNameDraft = $state("");
  let roomCodeDraft = $state("");
  let uiMessage = $state(
    "VRChat OSC bridge ready. Set a display name, then create or join a room.",
  );
  let disposeStateSubscription: (() => void) | undefined;

  onMount(() => {
    void initializeAppState();
    return () => {
      disposeStateSubscription?.();
    };
  });

  async function initializeAppState(): Promise<void> {
    appState = await window.api.getAppState();
    displayNameDraft = appState.displayName;

    disposeStateSubscription = window.api.onStateChanged((nextState) => {
      appState = nextState;
      displayNameDraft = nextState.displayName;

      if (nextState.errorState) {
        uiMessage = nextState.errorState.message;
      }
    });
  }

  async function saveDisplayName(): Promise<void> {
    const result = await window.api.updateDisplayName(displayNameDraft);
    if (result.ok) {
      uiMessage = "Display name saved.";
      return;
    }
    if ("error" in result) {
      uiMessage = result.error.message;
    }
  }

  async function createRoom(): Promise<void> {
    if (!appState.displayName) {
      uiMessage = "Set a display name first.";
      return;
    }
    uiMessage = "Sending create room request...";
    const result = await window.api.createRoom();
    if (result.ok) {
      uiMessage = "Room created.";
      return;
    }
    if ("error" in result) {
      uiMessage = result.error.message;
    }
  }

  async function joinRoom(): Promise<void> {
    if (!appState.displayName) {
      uiMessage = "Set a display name first.";
      return;
    }
    if (roomCodeDraft.trim().length === 0) {
      uiMessage = "Enter a room code to join.";
      return;
    }
    uiMessage = "Sending join room request...";
    const result = await window.api.joinRoom(
      roomCodeDraft.trim().toUpperCase(),
    );
    if (result.ok) {
      uiMessage = "Joined the room.";
      return;
    }
    if ("error" in result) {
      uiMessage = result.error.message;
    }
  }

  async function leaveRoom(): Promise<void> {
    uiMessage = "Leaving room...";
    const result = await window.api.leaveRoom();
    if (result.ok) {
      uiMessage = "Left the room.";
      return;
    }
    if ("error" in result) {
      uiMessage = result.error.message;
    }
  }

  async function takeOwner(): Promise<void> {
    const result = await window.api.takeOwner();
    uiMessage = result.ok
      ? "Owner updated."
      : "error" in result
        ? result.error.message
        : uiMessage;
  }

  async function saveRoomSettings(
    filterMode: FilterMode,
    filterPathsText: string,
    filterBlacklistPathsText: string,
    autoOwnerEnabled: boolean,
    instantOwnerTakeoverEnabled: boolean,
  ): Promise<void> {
    const filterPaths = filterPathsText
      .split(/\r?\n|,/)
      .map((entry) => entry.trim())
      .filter(Boolean);

    const filterBlacklistPaths = filterBlacklistPathsText
      .split(/\r?\n|,/)
      .map((entry) => entry.trim())
      .filter(Boolean);

    const result = await window.api.updateRoomSettings({
      filterMode,
      filterPaths,
      filterBlacklistPaths,
      autoOwnerEnabled,
      instantOwnerTakeoverEnabled,
    });

    if (result.ok) {
      localStorage.setItem("vrcpl:filterMode", filterMode);
      localStorage.setItem("vrcpl:filterPaths", JSON.stringify(filterPaths));
      localStorage.setItem(
        "vrcpl:filterBlacklistPaths",
        JSON.stringify(filterBlacklistPaths),
      );
    }

    uiMessage = result.ok
      ? "Room settings updated."
      : "error" in result
        ? result.error.message
        : uiMessage;
  }

  async function toggleParamSync(
    path: string,
    enabled: boolean,
  ): Promise<void> {
    await window.api.toggleParamSync(path, enabled);
  }

  async function toggleLocalPlayback(enabled: boolean): Promise<void> {
    await window.api.toggleLocalPlayback(enabled);
  }

  async function toggleInputSend(enabled: boolean): Promise<void> {
    await window.api.toggleInputSend(enabled);
  }

  async function toggleInputReceive(enabled: boolean): Promise<void> {
    await window.api.toggleInputReceive(enabled);
  }

  async function editParam(
    targetSessionId: string,
    param: ParamValue,
  ): Promise<void> {
    await window.api.editParam(targetSessionId, param);
  }

  async function sendAllParams(): Promise<void> {
    await window.api.sendAllParams();
    uiMessage = "All parameters sent for resync.";
  }

  $effect(() => {
    localStorage.setItem("vrcpl:displayName", appState.displayName);
  });
</script>

<main
  class="relative flex h-screen w-full flex-col overflow-hidden bg-transparent text-foreground"
>
  <AppHeader
    appName={appState.appName}
    appVersion={appState.appVersion}
    onClose={() => window.api.closeWindow()}
  />

  <div class="relative z-10 flex min-h-0 flex-1 flex-col">
    {#if appState.screen === "room"}
      <RoomScreen
        {appState}
        bind:displayNameDraft
        {uiMessage}
        onSaveDisplayName={saveDisplayName}
        onLeaveRoom={leaveRoom}
        onTakeOwner={takeOwner}
        onToggleParamSync={toggleParamSync}
        onToggleLocalPlayback={toggleLocalPlayback}
        onToggleInputSend={toggleInputSend}
        onToggleInputReceive={toggleInputReceive}
        onEditParam={editParam}
        onSendAllParams={sendAllParams}
        onSaveRoomSettings={saveRoomSettings}
      />
    {:else}
      <WelcomeScreen
        {appState}
        bind:displayNameDraft
        bind:roomCodeDraft
        {uiMessage}
        onSaveDisplayName={saveDisplayName}
        onCreateRoom={createRoom}
        onJoinRoom={joinRoom}
      />
    {/if}
  </div>
</main>
