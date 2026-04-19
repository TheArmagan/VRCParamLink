<script lang="ts">
  import {
    ArrowDownLeft,
    ArrowUpRight,
    Activity,
    UserPen,
  } from "@lucide/svelte";
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
    if (state.avatarSyncActive && state.selfAvatarId === state.ownerAvatarId) {
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
    <div class="ml-auto gap-1.5 flex items-center">
      <Badge variant={avatarBadge.variant} class="text-[10px] px-1.5 py-0">
        {avatarBadge.label}
        {#if state.avatarSyncActive && state.selfAvatarId === state.ownerAvatarId}
          <a
            class="ml-1 cursor-pointer"
            href={`vrcsl://switchavatar?avatarId=${state.ownerAvatarId}`}
            title="Switch to avatar using VRCSL"
          >
            <UserPen class="size-3.5" />
          </a>
        {/if}
      </Badge>
    </div>
  </div>
</div>
