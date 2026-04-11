<script lang="ts">
  import { ListFilter, Save, ChevronDown } from "@lucide/svelte";
  import type { FilterMode } from "../../../../../../shared/src/index.ts";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Textarea } from "$lib/components/ui/textarea/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import * as Collapsible from "$lib/components/ui/collapsible/index.js";
  import * as Select from "$lib/components/ui/select/index.js";

  let {
    isOwner = false,
    filterMode = $bindable<FilterMode>("allow_all"),
    filterPathsText = $bindable(""),
    filterBlacklistPathsText = $bindable(""),
    onSave = (
      _filterMode: FilterMode,
      _filterPathsText: string,
      _filterBlacklistPathsText: string,
    ) => {},
  }: {
    isOwner?: boolean;
    filterMode?: FilterMode;
    filterPathsText?: string;
    filterBlacklistPathsText?: string;
    onSave?: (
      filterMode: FilterMode,
      filterPathsText: string,
      filterBlacklistPathsText: string,
    ) => void;
  } = $props();

  let open = $state(false);

  let showWhitelistPaths = $derived(
    filterMode === "whitelist" || filterMode === "combined",
  );
  let showBlacklistPaths = $derived(
    filterMode === "blacklist" || filterMode === "combined",
  );
</script>

<Collapsible.Root bind:open>
  <Collapsible.Trigger
    class="flex w-full items-center justify-between rounded-md border border-border bg-muted/50 px-2.5 py-2 text-left text-xs"
  >
    <span class="flex items-center gap-1.5 font-medium text-foreground">
      <ListFilter class="size-3.5 text-muted-foreground" />
      Filter Settings
    </span>
    <ChevronDown
      class="size-3.5 text-muted-foreground transition-transform duration-200 {open
        ? 'rotate-180'
        : ''}"
    />
  </Collapsible.Trigger>
  <Collapsible.Content>
    <div class="mt-1.5 grid gap-2">
      <div class="grid gap-1">
        <Label class="text-[11px] text-muted-foreground">Filter Mode</Label>
        <Select.Root type="single" bind:value={filterMode} disabled={!isOwner}>
          <Select.Trigger class="w-full">
            {filterMode === "allow_all"
              ? "Allow All"
              : filterMode === "whitelist"
                ? "Whitelist"
                : filterMode === "blacklist"
                  ? "Blacklist"
                  : "Combined"}
          </Select.Trigger>
          <Select.Content>
            <Select.Item value="allow_all" label="Allow All" disabled={false}>
              Allow All
            </Select.Item>
            <Select.Item value="whitelist" label="Whitelist" disabled={false}>
              Whitelist
            </Select.Item>
            <Select.Item value="blacklist" label="Blacklist" disabled={false}>
              Blacklist
            </Select.Item>
            <Select.Item value="combined" label="Combined" disabled={false}>
              Combined
            </Select.Item>
          </Select.Content>
        </Select.Root>
      </div>

      {#if showWhitelistPaths}
        <div class="grid gap-1">
          <Label class="text-[11px] text-muted-foreground">
            {filterMode === "combined" ? "Whitelist Paths" : "Filter Paths"}
          </Label>
          <Textarea
            bind:value={filterPathsText}
            class="min-h-16 resize-none text-xs"
            disabled={!isOwner}
            placeholder="/avatar/parameters/Eye*&#10;/avatar/parameters/Hand*"
          />
        </div>
      {/if}

      {#if showBlacklistPaths}
        <div class="grid gap-1">
          <Label class="text-[11px] text-muted-foreground">
            {filterMode === "combined" ? "Blacklist Paths" : "Filter Paths"}
          </Label>
          {#if filterMode === "blacklist"}
            <Textarea
              bind:value={filterPathsText}
              class="min-h-16 resize-none text-xs"
              disabled={!isOwner}
              placeholder="/avatar/parameters/VF*_TC_*&#10;/avatar/parameters/Debug*"
            />
          {:else}
            <Textarea
              bind:value={filterBlacklistPathsText}
              class="min-h-16 resize-none text-xs"
              disabled={!isOwner}
              placeholder="/avatar/parameters/VF*_TC_*&#10;/avatar/parameters/Debug*"
            />
          {/if}
        </div>
      {/if}

      <Button
        variant="outline"
        size="sm"
        class="h-8"
        disabled={!isOwner}
        onclick={() =>
          onSave(filterMode, filterPathsText, filterBlacklistPathsText)}
      >
        <Save class="size-3.5" />
        Save Filters
      </Button>
    </div>
  </Collapsible.Content>
</Collapsible.Root>
