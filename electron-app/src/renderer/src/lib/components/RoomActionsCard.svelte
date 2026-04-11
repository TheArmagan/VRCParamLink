<script lang="ts">
  import { DoorOpen, LogIn } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";

  let {
    canInteract = false,
    roomCodeDraft = $bindable(""),
    onCreate = () => {},
    onJoin = () => {},
  }: {
    canInteract?: boolean;
    roomCodeDraft?: string;
    onCreate?: () => void;
    onJoin?: () => void;
  } = $props();
</script>

<div class="grid grid-cols-2 gap-2">
  <button
    class="flex flex-col rounded-lg border border-border bg-muted/50 p-2.5 text-left transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
    disabled={!canInteract}
    onclick={onCreate}
  >
    <DoorOpen class="mb-2 size-4 text-muted-foreground" />
    <div class="text-sm font-medium text-foreground">Create Room</div>
    <div class="mt-0.5 text-[11px] leading-4 text-muted-foreground">
      Start as the owner.
    </div>
  </button>

  <div class="flex flex-col rounded-lg border border-border bg-muted/50 p-2.5">
    <div
      class="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-foreground"
    >
      <LogIn class="size-3.5 text-muted-foreground" />
      Join Room
    </div>
    <Input
      bind:value={roomCodeDraft}
      class="h-8 text-sm tracking-[0.18em] uppercase"
      maxlength={16}
      placeholder="ROOM CODE"
    />
    <Button
      variant="outline"
      size="sm"
      class="mt-1.5 h-8 w-full"
      disabled={!canInteract}
      onclick={onJoin}
    >
      <LogIn class="size-3.5" />
      Join
    </Button>
  </div>
</div>
