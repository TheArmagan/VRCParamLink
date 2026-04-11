<script lang="ts">
  import {
    SlidersHorizontal,
    ChevronDown,
    RefreshCw,
    Search,
    Copy,
    Check,
  } from "@lucide/svelte";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Collapsible from "$lib/components/ui/collapsible/index.js";
  import type {
    ParamEntry,
    ParamValue,
  } from "../../../../../../shared/src/index.ts";

  const HIDDEN_PARAM_RE = /^VF\d+_TC_/;

  let {
    parameters = [],
    isOwner = false,
    selfSessionId = null,
    localPlaybackEnabled = true,
    onToggleSync = (_path: string, _enabled: boolean) => {},
    onToggleLocalPlayback = (_enabled: boolean) => {},
    onEditParam = (_targetSessionId: string, _param: ParamValue) => {},
    onSendAllParams = () => {},
  }: {
    parameters: ParamEntry[];
    isOwner: boolean;
    selfSessionId: string | null;
    localPlaybackEnabled: boolean;
    onToggleSync?: (path: string, enabled: boolean) => void;
    onToggleLocalPlayback?: (enabled: boolean) => void;
    onEditParam?: (targetSessionId: string, param: ParamValue) => void;
    onSendAllParams?: () => void;
  } = $props();

  let open = $state(false);
  let searchQuery = $state("");
  let copiedPath: string | null = $state(null);

  function copyPath(path: string): void {
    navigator.clipboard.writeText(path);
    copiedPath = path;
    setTimeout(() => {
      if (copiedPath === path) copiedPath = null;
    }, 1500);
  }

  let filteredParams = $derived(
    parameters
      .filter((e) => !HIDDEN_PARAM_RE.test(shortName(e.path)))
      .filter(
        (e) =>
          !searchQuery ||
          shortName(e.path).toLowerCase().includes(searchQuery.toLowerCase()),
      ),
  );

  function shortName(path: string): string {
    const segments = path.split("/");
    return segments[segments.length - 1] || path;
  }

  function handleBoolChange(entry: ParamEntry, checked: boolean): void {
    if (!selfSessionId) return;
    onEditParam(selfSessionId, {
      path: entry.path,
      valueType: "bool",
      value: checked,
    });
  }

  function handleSliderChange(
    entry: ParamEntry,
    event: Event & { currentTarget: HTMLInputElement },
  ): void {
    if (!selfSessionId) return;
    const raw = parseFloat(event.currentTarget.value);
    const value = entry.valueType === "int" ? Math.round(raw) : raw;
    onEditParam(selfSessionId, {
      path: entry.path,
      valueType: entry.valueType,
      value,
    });
  }
</script>

<Collapsible.Root bind:open>
  <Collapsible.Trigger
    class="flex w-full items-center justify-between rounded-md border border-border bg-muted/50 px-2.5 py-2 text-left text-xs"
  >
    <span class="flex items-center gap-1.5 font-medium text-foreground">
      <SlidersHorizontal class="size-3.5 text-muted-foreground" />
      Parameters
      <span class="text-muted-foreground">({filteredParams.length})</span>
    </span>
    <ChevronDown
      class="size-3.5 text-muted-foreground transition-transform duration-200 {open
        ? 'rotate-180'
        : ''}"
    />
  </Collapsible.Trigger>
  <Collapsible.Content>
    <div
      class="mt-1.5 flex items-center justify-between rounded-md border border-border px-2.5 py-1.5 text-xs"
    >
      <span class="text-muted-foreground">Affect local player</span>
      <Switch
        size="sm"
        checked={localPlaybackEnabled}
        onCheckedChange={(checked) => onToggleLocalPlayback(checked)}
      />
    </div>
    <div class="mt-1.5">
      <Button
        variant="outline"
        size="sm"
        class="w-full text-xs"
        onclick={() => onSendAllParams()}
        disabled={filteredParams.length === 0}
      >
        <RefreshCw class="mr-1.5 size-3.5" />
        Send All Parameters
      </Button>
    </div>
    <div class="relative mt-1.5">
      <Search
        class="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
      />
      <input
        type="text"
        placeholder="Search parameters..."
        bind:value={searchQuery}
        class="w-full rounded-md border border-border bg-transparent py-1.5 pl-7 pr-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />
    </div>
    <div
      class="mt-1.5 max-h-52 overflow-y-auto overflow-x-hidden rounded-md border border-border"
      style="scroll-behavior:smooth;-webkit-overflow-scrolling:touch;"
    >
      {#if filteredParams.length === 0}
        <p class="px-2.5 py-3 text-center text-xs text-muted-foreground">
          No parameters received yet.
        </p>
      {:else}
        {#each filteredParams as entry (entry.path)}
          <div
            class="border-b border-border px-2.5 py-1.5 last:border-b-0 text-xs"
          >
            <!-- Row 1: Param name + sync toggle -->
            <div class="flex items-center justify-between gap-2">
              <div class="flex min-w-0 items-center gap-1">
                <span
                  class="min-w-0 truncate font-mono text-foreground"
                  title={entry.path}
                >
                  {shortName(entry.path)}
                </span>
                <button
                  type="button"
                  class="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                  title="Copy full path"
                  onclick={() => copyPath(entry.path)}
                >
                  {#if copiedPath === entry.path}
                    <Check class="size-3 text-green-500" />
                  {:else}
                    <Copy class="size-3" />
                  {/if}
                </button>
              </div>
              {#if !isOwner}
                <Switch
                  size="sm"
                  checked={entry.syncEnabled}
                  onCheckedChange={(checked) =>
                    onToggleSync(entry.path, checked)}
                />
              {/if}
            </div>

            <!-- Row 2: Value control -->
            <div class="mt-1 flex items-center gap-1.5">
              {#if entry.valueType === "bool"}
                <Switch
                  size="sm"
                  checked={entry.value === true}
                  onCheckedChange={(checked) =>
                    handleBoolChange(entry, checked)}
                />
                <span class="flex-1"></span>
              {:else if entry.valueType === "float"}
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={typeof entry.value === "number" ? entry.value : 0}
                  class="h-1.5 flex-1 accent-primary"
                  oninput={(e) => handleSliderChange(entry, e)}
                />
                <span
                  class="w-8 shrink-0 text-right font-mono text-muted-foreground"
                >
                  {typeof entry.value === "number"
                    ? entry.value.toFixed(2)
                    : "0.00"}
                </span>
              {:else}
                <!-- int -->
                <input
                  type="range"
                  min="0"
                  max="255"
                  step="1"
                  value={typeof entry.value === "number" ? entry.value : 0}
                  class="h-1.5 flex-1 accent-primary"
                  oninput={(e) => handleSliderChange(entry, e)}
                />
                <span
                  class="w-8 shrink-0 text-right font-mono text-muted-foreground"
                >
                  {typeof entry.value === "number"
                    ? String(Math.round(entry.value)).padStart(3, "\u2007")
                    : "  0"}
                </span>
              {/if}
            </div>
          </div>
        {/each}
      {/if}
    </div>
  </Collapsible.Content>
</Collapsible.Root>
