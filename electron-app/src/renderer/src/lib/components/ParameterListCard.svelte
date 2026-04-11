<script lang="ts">
  import { SlidersHorizontal, ChevronDown } from "@lucide/svelte";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import * as Collapsible from "$lib/components/ui/collapsible/index.js";
  import type {
    ParamEntry,
    ParamValue,
  } from "../../../../../../shared/src/index.ts";

  let {
    parameters = [],
    isOwner = false,
    onToggleSync = (_path: string, _enabled: boolean) => {},
    onEditParam = (_param: ParamValue) => {},
  }: {
    parameters: ParamEntry[];
    isOwner: boolean;
    onToggleSync?: (path: string, enabled: boolean) => void;
    onEditParam?: (param: ParamValue) => void;
  } = $props();

  let open = $state(false);

  function shortName(path: string): string {
    const segments = path.split("/");
    return segments[segments.length - 1] || path;
  }

  function handleBoolChange(entry: ParamEntry, checked: boolean): void {
    onEditParam({
      path: entry.path,
      valueType: "bool",
      value: checked,
    });
  }

  function handleSliderChange(
    entry: ParamEntry,
    event: Event & { currentTarget: HTMLInputElement },
  ): void {
    const raw = parseFloat(event.currentTarget.value);
    const value = entry.valueType === "int" ? Math.round(raw) : raw;
    onEditParam({
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
      <span class="text-muted-foreground">({parameters.length})</span>
    </span>
    <ChevronDown
      class="size-3.5 text-muted-foreground transition-transform duration-200 {open
        ? 'rotate-180'
        : ''}"
    />
  </Collapsible.Trigger>
  <Collapsible.Content>
    <div
      class="mt-1.5 max-h-52 overflow-y-auto rounded-md border border-border"
    >
      {#if parameters.length === 0}
        <p class="px-2.5 py-3 text-center text-xs text-muted-foreground">
          No parameters received yet.
        </p>
      {:else}
        {#each parameters as entry (entry.path)}
          <div
            class="flex items-center gap-2 border-b border-border px-2.5 py-1.5 last:border-b-0 text-xs"
          >
            <!-- Param name -->
            <span
              class="min-w-0 flex-1 truncate font-mono text-foreground"
              title={entry.path}
            >
              {shortName(entry.path)}
            </span>

            <!-- Value control -->
            <div class="flex shrink-0 items-center gap-1.5">
              {#if entry.valueType === "bool"}
                <Switch
                  size="sm"
                  checked={entry.value === true}
                  disabled={!isOwner}
                  onCheckedChange={(checked) =>
                    handleBoolChange(entry, checked)}
                />
              {:else if entry.valueType === "float"}
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={typeof entry.value === "number" ? entry.value : 0}
                  disabled={!isOwner}
                  class="h-1.5 w-16 accent-primary disabled:opacity-50"
                  oninput={(e) => handleSliderChange(entry, e)}
                />
                <span class="w-8 text-right text-muted-foreground">
                  {typeof entry.value === "number"
                    ? entry.value.toFixed(2)
                    : "0"}
                </span>
              {:else}
                <!-- int -->
                <input
                  type="range"
                  min="0"
                  max="255"
                  step="1"
                  value={typeof entry.value === "number" ? entry.value : 0}
                  disabled={!isOwner}
                  class="h-1.5 w-16 accent-primary disabled:opacity-50"
                  oninput={(e) => handleSliderChange(entry, e)}
                />
                <span class="w-6 text-right text-muted-foreground">
                  {typeof entry.value === "number"
                    ? Math.round(entry.value)
                    : "0"}
                </span>
              {/if}
            </div>

            <!-- Sync toggle (non-owner only) -->
            {#if !isOwner}
              <Switch
                size="sm"
                checked={entry.syncEnabled}
                onCheckedChange={(checked) => onToggleSync(entry.path, checked)}
              />
            {/if}
          </div>
        {/each}
      {/if}
    </div>
  </Collapsible.Content>
</Collapsible.Root>
