<script lang="ts">
  import { PersonStanding, ChevronDown, RotateCcw } from "@lucide/svelte";
  import type { TrackingSlotState } from "../../../../../../shared/src/index.ts";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Separator } from "$lib/components/ui/separator/index.js";
  import * as Collapsible from "$lib/components/ui/collapsible/index.js";

  const SLOT_LABELS: Record<string, string> = {
    "/tracking/trackers/head": "Head",
    "/tracking/trackers/1": "Left Hand",
    "/tracking/trackers/2": "Right Hand",
    "/tracking/trackers/3": "Tracker 3",
    "/tracking/trackers/4": "Tracker 4",
    "/tracking/trackers/5": "Tracker 5",
    "/tracking/trackers/6": "Tracker 6",
    "/tracking/trackers/7": "Tracker 7",
    "/tracking/trackers/8": "Tracker 8",
  };

  function slotLabel(address: string): string {
    return SLOT_LABELS[address] ?? address;
  }

  let {
    trackingSendEnabled = false,
    trackingReceiveEnabled = false,
    trackingSendSlots = [] as TrackingSlotState[],
    trackingReceiveSlots = [] as TrackingSlotState[],
    onToggleTrackingSend = (_enabled: boolean) => {},
    onToggleTrackingReceive = (_enabled: boolean) => {},
    onRecalibrateTrackingReceive = () => {},
    onToggleTrackingSendSlot = (_address: string, _enabled: boolean) => {},
    onToggleTrackingReceiveSlot = (_address: string, _enabled: boolean) => {},
  }: {
    trackingSendEnabled?: boolean;
    trackingReceiveEnabled?: boolean;
    trackingSendSlots?: TrackingSlotState[];
    trackingReceiveSlots?: TrackingSlotState[];
    onToggleTrackingSend?: (enabled: boolean) => void;
    onToggleTrackingReceive?: (enabled: boolean) => void;
    onRecalibrateTrackingReceive?: () => void;
    onToggleTrackingSendSlot?: (address: string, enabled: boolean) => void;
    onToggleTrackingReceiveSlot?: (address: string, enabled: boolean) => void;
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

      {#if trackingSendEnabled && trackingSendSlots.length > 0}
        <div class="grid gap-1 pl-2">
          {#each trackingSendSlots as slot (slot.address)}
            <div
              class="flex items-center justify-between rounded border border-border/50 bg-background/30 px-2 py-1"
            >
              <span class="text-[11px] text-muted-foreground"
                >{slotLabel(slot.address)}</span
              >
              <Switch
                checked={slot.enabled}
                onCheckedChange={(checked) =>
                  onToggleTrackingSendSlot(slot.address, checked)}
              />
            </div>
          {/each}
        </div>
      {/if}

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

      {#if trackingReceiveEnabled}
        <!-- Recalibrate Receive Origin -->
        <button
          class="flex w-full items-center justify-center gap-1.5 rounded-md border border-border bg-background/50 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          onclick={() => onRecalibrateTrackingReceive()}
        >
          <RotateCcw class="size-3" />
          Recalibrate Position
        </button>

        {#if trackingReceiveSlots.length > 0}
          <div class="grid gap-1 pl-2">
            {#each trackingReceiveSlots as slot (slot.address)}
              <div
                class="flex items-center justify-between rounded border border-border/50 bg-background/30 px-2 py-1"
              >
                <span class="text-[11px] text-muted-foreground"
                  >{slotLabel(slot.address)}</span
                >
                <Switch
                  checked={slot.enabled}
                  onCheckedChange={(checked) =>
                    onToggleTrackingReceiveSlot(slot.address, checked)}
                />
              </div>
            {/each}
          </div>
        {/if}
      {/if}
    </div>
  </Collapsible.Content>
</Collapsible.Root>
