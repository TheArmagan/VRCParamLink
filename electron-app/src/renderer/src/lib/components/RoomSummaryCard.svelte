<script lang="ts">
  import { Copy, DoorOpen, PencilLine } from "@lucide/svelte";
  import type { RendererAppState } from "../../../../../../shared/src/index.ts";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";

  let {
    state,
    displayNameDraft = $bindable(""),
    onSaveDisplayName = () => {},
    onLeaveRoom = () => {},
  }: {
    state: RendererAppState;
    displayNameDraft?: string;
    onSaveDisplayName?: () => void;
    onLeaveRoom?: () => void;
  } = $props();

  async function copyRoomCode(): Promise<void> {
    if (state.roomCode) {
      await navigator.clipboard.writeText(state.roomCode);
    }
  }
</script>

<div class="grid gap-2">
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-1.5">
      <span class="text-base font-semibold tracking-[0.16em] text-foreground">
        {state.roomCode}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        class="size-6 text-muted-foreground hover:text-foreground"
        onclick={copyRoomCode}
      >
        <Copy class="size-3.5" />
      </Button>
    </div>

    <Button
      variant="destructive"
      size="sm"
      class="h-7 text-xs"
      onclick={onLeaveRoom}
    >
      <DoorOpen class="size-3.5" />
      Leave
    </Button>
  </div>

  <div class="flex gap-2">
    <Input
      bind:value={displayNameDraft}
      class="h-8 flex-1 text-sm"
      maxlength={32}
      placeholder="Display name"
    />
    <Button variant="outline" size="sm" class="h-8" onclick={onSaveDisplayName}>
      <PencilLine class="size-3.5" />
      Update
    </Button>
  </div>
</div>
