<script lang="ts">
  import { Gamepad2, ChevronDown, AlertTriangle } from "@lucide/svelte";
  import {
    VRC_INPUT_AXES,
    VRC_INPUT_BUTTONS,
    type InputSyncToggles,
  } from "../../../../../../shared/src/index";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Separator } from "$lib/components/ui/separator/index.js";
  import * as Collapsible from "$lib/components/ui/collapsible/index.js";

  let {
    inputSendEnabled = false,
    inputSyncToggles = {} as InputSyncToggles,
    onToggleInputSend = (_enabled: boolean) => {},
    onToggleInputSync = (_path: string, _enabled: boolean) => {},
  }: {
    inputSendEnabled?: boolean;
    inputSyncToggles?: InputSyncToggles;
    onToggleInputSend?: (enabled: boolean) => void;
    onToggleInputSync?: (path: string, enabled: boolean) => void;
  } = $props();

  let open = $state(false);

  const SENSITIVE_INPUTS = new Set(["/input/PanicButton", "/input/Voice"]);

  function shortName(path: string): string {
    return path.split("/").pop() ?? path;
  }

  function isEnabled(path: string): boolean {
    return inputSyncToggles[path] ?? false;
  }

  function enableAll(): void {
    for (const path of [...VRC_INPUT_AXES, ...VRC_INPUT_BUTTONS]) {
      onToggleInputSync(path, true);
    }
  }

  function disableAll(): void {
    for (const path of [...VRC_INPUT_AXES, ...VRC_INPUT_BUTTONS]) {
      onToggleInputSync(path, false);
    }
  }
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
    <div class="mt-1.5 grid gap-2.5">
      <p class="text-[11px] text-muted-foreground">
        Control which /input commands are synced from other users
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

      <!-- Enable All / Disable All -->
      <div class="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          class="h-6 text-[11px]"
          onclick={enableAll}
        >
          Enable All
        </Button>
        <Button
          variant="outline"
          size="sm"
          class="h-6 text-[11px]"
          onclick={disableAll}
        >
          Disable All
        </Button>
      </div>

      <!-- Axes -->
      <div class="grid gap-1">
        <Label class="text-[11px] font-medium text-muted-foreground">Axes</Label
        >
        <div class="grid gap-0.5">
          {#each VRC_INPUT_AXES as path}
            <div
              class="flex items-center justify-between rounded px-2 py-1 hover:bg-muted/50"
            >
              <span class="text-[11px] text-foreground">{shortName(path)}</span>
              <Switch
                checked={isEnabled(path)}
                onCheckedChange={(checked) => onToggleInputSync(path, checked)}
              />
            </div>
          {/each}
        </div>
      </div>

      <!-- Buttons -->
      <div class="grid gap-1">
        <Label class="text-[11px] font-medium text-muted-foreground"
          >Buttons</Label
        >
        <div class="grid gap-0.5">
          {#each VRC_INPUT_BUTTONS as path}
            <div
              class="flex items-center justify-between rounded px-2 py-1 hover:bg-muted/50"
            >
              <span class="flex items-center gap-1 text-[11px] text-foreground">
                {shortName(path)}
                {#if SENSITIVE_INPUTS.has(path)}
                  <AlertTriangle class="size-3 text-amber-400" />
                {/if}
              </span>
              <Switch
                checked={isEnabled(path)}
                onCheckedChange={(checked) => onToggleInputSync(path, checked)}
              />
            </div>
          {/each}
        </div>
      </div>
    </div>
  </Collapsible.Content>
</Collapsible.Root>
