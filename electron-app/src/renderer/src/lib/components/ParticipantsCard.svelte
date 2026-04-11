<script lang="ts">
  import { Crown, Users, ChevronDown } from "@lucide/svelte";
  import type {
    ParamEntry,
    ParamValue,
    Participant,
  } from "../../../../../../shared/src/index.ts";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import * as Collapsible from "$lib/components/ui/collapsible/index.js";

  const HIDDEN_PARAM_RE = /^VF\d+_TC_/;

  let {
    participants = [],
    ownerSessionId = null,
    selfSessionId = null,
    participantParams = {},
    onEditParam = (_targetSessionId: string, _param: ParamValue) => {},
  }: {
    participants?: Participant[];
    ownerSessionId?: string | null;
    selfSessionId?: string | null;
    participantParams?: Record<string, ParamEntry[]>;
    onEditParam?: (targetSessionId: string, param: ParamValue) => void;
  } = $props();

  let expandedParticipants: Record<string, boolean> = $state({});

  function shortName(path: string): string {
    const segments = path.split("/");
    return segments[segments.length - 1] || path;
  }

  function getFilteredParams(sessionId: string): ParamEntry[] {
    const params = participantParams[sessionId] ?? [];
    return params.filter((e) => !HIDDEN_PARAM_RE.test(shortName(e.path)));
  }

  function handleBoolChange(
    targetSessionId: string,
    entry: ParamEntry,
    checked: boolean,
  ): void {
    onEditParam(targetSessionId, {
      path: entry.path,
      valueType: "bool",
      value: checked,
    });
  }

  function handleSliderChange(
    targetSessionId: string,
    entry: ParamEntry,
    event: Event & { currentTarget: HTMLInputElement },
  ): void {
    const raw = parseFloat(event.currentTarget.value);
    const value = entry.valueType === "int" ? Math.round(raw) : raw;
    onEditParam(targetSessionId, {
      path: entry.path,
      valueType: entry.valueType,
      value,
    });
  }
</script>

<div class="grid gap-1.5">
  <div
    class="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
  >
    <Users class="size-3.5" />
    Participants ({participants.length})
  </div>

  {#if participants.length === 0}
    <div
      class="rounded-md border border-border bg-muted/50 px-2.5 py-2 text-center text-xs text-muted-foreground"
    >
      No participants yet.
    </div>
  {:else}
    <div class="grid gap-1.5">
      {#each participants as participant (participant.sessionId)}
        {@const params = getFilteredParams(participant.sessionId)}
        <Collapsible.Root
          open={expandedParticipants[participant.sessionId] ?? false}
          onOpenChange={(v) =>
            (expandedParticipants[participant.sessionId] = v)}
        >
          <Collapsible.Trigger
            class="flex w-full items-center justify-between rounded-md border border-border bg-muted/50 px-2 py-1.5 text-left text-xs"
          >
            <span class="flex items-center gap-1.5">
              <span class="font-medium text-foreground"
                >{participant.displayName}</span
              >
              {#if participant.sessionId === selfSessionId}
                <span class="text-muted-foreground">(You)</span>
              {/if}
              {#if participant.sessionId === ownerSessionId}
                <Crown class="size-3 text-amber-400" />
              {/if}
              {#if params.length > 0}
                <span class="text-muted-foreground">({params.length})</span>
              {/if}
            </span>
            <ChevronDown
              class="size-3.5 text-muted-foreground transition-transform duration-200 {expandedParticipants[
                participant.sessionId
              ]
                ? 'rotate-180'
                : ''}"
            />
          </Collapsible.Trigger>
          <Collapsible.Content>
            {#if params.length === 0}
              <p
                class="mt-1 rounded-md border border-border px-2.5 py-2 text-center text-xs text-muted-foreground"
              >
                No parameters yet.
              </p>
            {:else}
              <div
                class="mt-1 max-h-40 overflow-y-auto overflow-x-hidden rounded-md border border-border"
                style="scroll-behavior:smooth;-webkit-overflow-scrolling:touch;"
              >
                {#each params as entry (entry.path)}
                  <div
                    class="border-b border-border px-2.5 py-1.5 text-xs last:border-b-0"
                  >
                    <div class="flex items-center justify-between gap-2">
                      <span
                        class="min-w-0 truncate font-mono text-foreground"
                        title={entry.path}
                      >
                        {shortName(entry.path)}
                      </span>
                    </div>
                    <div class="mt-1 flex items-center gap-1.5">
                      {#if entry.valueType === "bool"}
                        <Switch
                          size="sm"
                          checked={entry.value === true}
                          onCheckedChange={(checked) =>
                            handleBoolChange(
                              participant.sessionId,
                              entry,
                              checked,
                            )}
                        />
                        <span class="flex-1"></span>
                      {:else if entry.valueType === "float"}
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.01"
                          value={typeof entry.value === "number"
                            ? entry.value
                            : 0}
                          class="h-1.5 flex-1 accent-primary"
                          oninput={(e) =>
                            handleSliderChange(participant.sessionId, entry, e)}
                        />
                        <span
                          class="w-8 shrink-0 text-right font-mono text-muted-foreground"
                        >
                          {typeof entry.value === "number"
                            ? entry.value.toFixed(2)
                            : "0.00"}
                        </span>
                      {:else}
                        <input
                          type="range"
                          min="0"
                          max="255"
                          step="1"
                          value={typeof entry.value === "number"
                            ? entry.value
                            : 0}
                          class="h-1.5 flex-1 accent-primary"
                          oninput={(e) =>
                            handleSliderChange(participant.sessionId, entry, e)}
                        />
                        <span
                          class="w-8 shrink-0 text-right font-mono text-muted-foreground"
                        >
                          {typeof entry.value === "number"
                            ? String(Math.round(entry.value)).padStart(
                                3,
                                "\u2007",
                              )
                            : "  0"}
                        </span>
                      {/if}
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </Collapsible.Content>
        </Collapsible.Root>
      {/each}
    </div>
  {/if}
</div>
