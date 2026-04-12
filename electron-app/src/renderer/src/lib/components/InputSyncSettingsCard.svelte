<script lang="ts">
  import { Gamepad2, ChevronDown } from "@lucide/svelte";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Separator } from "$lib/components/ui/separator/index.js";
  import * as Collapsible from "$lib/components/ui/collapsible/index.js";

  let {
    inputSendEnabled = false,
    inputReceiveEnabled = false,
    onToggleInputSend = (_enabled: boolean) => {},
    onToggleInputReceive = (_enabled: boolean) => {},
  }: {
    inputSendEnabled?: boolean;
    inputReceiveEnabled?: boolean;
    onToggleInputSend?: (enabled: boolean) => void;
    onToggleInputReceive?: (enabled: boolean) => void;
  } = $props();

  let open = $state(false);
</script>

<Collapsible.Root bind:open>
  <Collapsible.Trigger
    class="flex w-full items-center justify-between rounded-md border border-border bg-muted/50 px-2.5 py-2 text-left text-xs"
  >
    <span class="flex items-center gap-1.5 font-medium text-foreground">
      <Gamepad2 class="size-3.5 text-muted-foreground" />
      Input Sync
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
        Sync movement & input commands between room members via velocity mapping
      </p>

      <!-- Send My Inputs -->
      <div
        class="flex items-center justify-between rounded-md border border-border bg-background/50 px-2.5 py-2"
      >
        <Label class="text-xs font-medium">Send My Inputs</Label>
        <Switch
          checked={inputSendEnabled}
          onCheckedChange={(checked) => onToggleInputSend(checked)}
        />
      </div>

      <Separator />

      <!-- Receive Inputs -->
      <div
        class="flex items-center justify-between rounded-md border border-border bg-background/50 px-2.5 py-2"
      >
        <Label class="text-xs font-medium">Receive Inputs</Label>
        <Switch
          checked={inputReceiveEnabled}
          onCheckedChange={(checked) => onToggleInputReceive(checked)}
        />
      </div>
    </div>
  </Collapsible.Content>
</Collapsible.Root>
