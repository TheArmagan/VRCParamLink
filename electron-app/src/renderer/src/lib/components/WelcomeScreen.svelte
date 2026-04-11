<script lang="ts">
  import type { RendererAppState } from "../../../../../../shared/src/index.ts";
  import DisplayNameCard from "./DisplayNameCard.svelte";
  import HeroCard from "./HeroCard.svelte";
  import RoomActionsCard from "./RoomActionsCard.svelte";

  let {
    appState,
    displayNameDraft = $bindable(""),
    roomCodeDraft = $bindable(""),
    uiMessage = "",
    onSaveDisplayName = () => {},
    onCreateRoom = () => {},
    onJoinRoom = () => {},
  }: {
    appState: RendererAppState;
    displayNameDraft?: string;
    roomCodeDraft?: string;
    uiMessage?: string;
    onSaveDisplayName?: () => void;
    onCreateRoom?: () => void;
    onJoinRoom?: () => void;
  } = $props();
</script>

<section class="flex flex-1 flex-col gap-2.5 overflow-y-auto p-3">
  <HeroCard connectionState={appState.connectionState}>
    <div class="grid gap-3">
      <DisplayNameCard
        bind:draft={displayNameDraft}
        onSave={onSaveDisplayName}
      />
      <RoomActionsCard
        bind:roomCodeDraft
        canInteract={Boolean(appState.displayName)}
        onCreate={onCreateRoom}
        onJoin={onJoinRoom}
      />
    </div>
  </HeroCard>

  {#if uiMessage}
    <p class="px-1 text-xs leading-5 text-muted-foreground">
      {uiMessage}
    </p>
  {/if}
</section>
