<script lang="ts">
  import { ArrowDownLeft, ArrowUpRight, Activity } from "@lucide/svelte";
  import type { RendererAppState } from "../../../../../../shared/src/index.ts";

  let {
    state,
  }: {
    state: RendererAppState;
  } = $props();
</script>

<div
  class="flex items-center gap-3 rounded-md border border-border bg-muted/50 px-2.5 py-2 text-xs"
>
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
