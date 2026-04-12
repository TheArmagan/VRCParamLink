<script lang="ts">
  import { PersonStanding, ChevronDown } from "@lucide/svelte";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Separator } from "$lib/components/ui/separator/index.js";
  import * as Collapsible from "$lib/components/ui/collapsible/index.js";

  let {
    trackingSendEnabled = false,
    trackingReceiveEnabled = false,
    onToggleTrackingSend = (_enabled: boolean) => {},
    onToggleTrackingReceive = (_enabled: boolean) => {},
  }: {
    trackingSendEnabled?: boolean;
    trackingReceiveEnabled?: boolean;
    onToggleTrackingSend?: (enabled: boolean) => void;
    onToggleTrackingReceive?: (enabled: boolean) => void;
  } = $props();

  let open = $state(false);
</script>

<Collapsible.Root bind:open>
  <Collapsible.Trigger
    class="flex w-full items-center justify-between rounded-md border border-border bg-muted/50 px-2.5 py-2 text-left text-xs"
  >
    <span class="flex items-center gap-1.5 font-medium text-foreground">
      <PersonStanding class="size-3.5 text-muted-foreground" />
      Tracking Sync
    </span>
    <ChevronDown
      class="size-3.5 text-muted-foreground transition-transform duration-200 {open
        ? 'rotate-180'
        : ''}"
    />
  </Collapsible.Trigger>
  <Collapsible.Content>
    <div class="mt-1.5 grid gap-2">
      <p class="text-[11px] text-muted-foreground">
        Sync full-body tracking data between room members via OpenVR
      </p>

      <!-- Send My Tracking -->
      <div
        class="flex items-center justify-between rounded-md border border-border bg-background/50 px-2.5 py-2"
      >
        <Label class="text-xs font-medium">Send My Tracking</Label>
        <Switch
          checked={trackingSendEnabled}
          onCheckedChange={(checked) => onToggleTrackingSend(checked)}
        />
      </div>

      <Separator />

      <!-- Receive Tracking -->
      <div
        class="flex items-center justify-between rounded-md border border-border bg-background/50 px-2.5 py-2"
      >
        <Label class="text-xs font-medium">Receive Tracking</Label>
        <Switch
          checked={trackingReceiveEnabled}
          onCheckedChange={(checked) => onToggleTrackingReceive(checked)}
        />
      </div>
    </div>
  </Collapsible.Content>
</Collapsible.Root>
