<script lang="ts">
  import { Crown, Settings, WandSparkles, ChevronDown } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import * as Collapsible from "$lib/components/ui/collapsible/index.js";

  let {
    isOwner = false,
    autoOwnerEnabled = false,
    instantOwnerTakeoverEnabled = true,
    canTakeOwner = false,
    onTakeOwner = () => {},
    onToggleAutoOwner = (_enabled: boolean) => {},
    onToggleInstantOwner = (_enabled: boolean) => {},
  }: {
    isOwner?: boolean;
    autoOwnerEnabled?: boolean;
    instantOwnerTakeoverEnabled?: boolean;
    canTakeOwner?: boolean;
    onTakeOwner?: () => void;
    onToggleAutoOwner?: (enabled: boolean) => void;
    onToggleInstantOwner?: (enabled: boolean) => void;
  } = $props();

  let open = $state(false);
</script>

<Collapsible.Root bind:open>
  <Collapsible.Trigger
    class="flex w-full items-center justify-between rounded-md border border-border bg-muted/50 px-2.5 py-2 text-left text-xs"
  >
    <span class="flex items-center gap-1.5 font-medium text-foreground">
      <Settings class="size-3.5 text-muted-foreground" />
      Owner Controls
      {#if isOwner}
        <span class="text-muted-foreground">(You)</span>
      {/if}
    </span>
    <ChevronDown
      class="size-3.5 text-muted-foreground transition-transform duration-200 {open
        ? 'rotate-180'
        : ''}"
    />
  </Collapsible.Trigger>
  <Collapsible.Content>
    <div class="mt-1.5 grid gap-1.5">
      {#if !isOwner && canTakeOwner}
        <Button
          variant="outline"
          size="sm"
          class="h-8 w-full"
          onclick={onTakeOwner}
        >
          <Crown class="size-3.5" />
          Take ownership
        </Button>
      {/if}

      <div
        class="flex items-center justify-between rounded-md border border-border bg-muted/50 px-2.5 py-1.5"
      >
        <Label class="flex items-center gap-1.5 text-xs text-foreground">
          <WandSparkles class="size-3.5 text-muted-foreground" />
          Auto-owner
        </Label>
        <Switch
          checked={autoOwnerEnabled}
          disabled={!isOwner}
          onCheckedChange={(checked) => onToggleAutoOwner(checked)}
          size="sm"
        />
      </div>

      <div
        class="flex items-center justify-between rounded-md border border-border bg-muted/50 px-2.5 py-1.5"
      >
        <Label class="text-xs text-foreground">Instant takeover</Label>
        <Switch
          checked={instantOwnerTakeoverEnabled}
          disabled={!isOwner}
          onCheckedChange={(checked) => onToggleInstantOwner(checked)}
          size="sm"
        />
      </div>
    </div>
  </Collapsible.Content>
</Collapsible.Root>
