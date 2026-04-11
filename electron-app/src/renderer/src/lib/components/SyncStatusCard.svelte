<script lang="ts">
  import { ArrowDownLeft, ArrowUpRight, Activity } from "@lucide/svelte";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import type { RendererAppState } from "../../../../../../shared/src/index.ts";

  let {
    state,
  }: {
    state: RendererAppState;
  } = $props();

  let avatarBadge = $derived.by(() => {
    if (!state.selfAvatarId || !state.ownerAvatarId) {
      return { label: "Waiting for avatar", variant: "secondary" as const };
    }
    if (state.avatarSyncActive) {
      return { label: "Avatar Matched", variant: "default" as const };
    }
    return { label: "Avatar Mismatch", variant: "destructive" as const };
  });
</script>

<div
  class="flex flex-col gap-1.5 rounded-md border border-border bg-muted/50 px-2.5 py-2 text-xs"
>
  <div class="flex items-center gap-3">
    <div class="flex items-center gap-1.5 text-muted-foreground">
      <Activity class="size-3.5" />
      <span>Sync</span>
    </div>

    <div class="flex items-center gap-1.5 font-medium text-foreground">
      {#if state.lastSyncDirection === "incoming"}
        <ArrowDownLeft class="size-3.5 text-emerald-400" />
        Incoming
      {:else if state.lastSyncDirection === "outgoing"}
        <ArrowUpRight class="size-3.5 text-sky-400" />
        Outgoing
      {:else}
        Waiting
      {/if}
    </div>

    <span class="text-muted-foreground">·</span>
    <span class="text-muted-foreground">
      {state.lastBatchSize} params
    </span>

    <div class="ml-auto flex items-center gap-2 text-muted-foreground">
      <span>↑{state.sentBatchCount}</span>
      <span>↓{state.receivedBatchCount}</span>
    </div>
  </div>

  <div class="flex items-center gap-2">
    {#if state.lastSyncParamName}
      <span
        class="truncate font-mono text-muted-foreground"
        title={state.lastSyncParamName}
      >
        {state.lastSyncParamName}
      </span>
    {/if}
    <div class="ml-auto">
      <Badge variant={avatarBadge.variant} class="text-[10px] px-1.5 py-0">
        {avatarBadge.label}
      </Badge>
    </div>
  </div>
</div>
