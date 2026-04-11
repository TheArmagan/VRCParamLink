<script lang="ts">
  import { PencilLine, UserRound } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";

  let {
    draft = $bindable(""),
    onSave = () => {},
  }: {
    draft?: string;
    onSave?: () => void;
  } = $props();
</script>

<div>
  <div
    class="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
  >
    <UserRound class="size-3.5" />
    Display Name
  </div>
  <div class="flex gap-2">
    <Input
      bind:value={draft}
      class="h-8 flex-1 text-sm"
      maxlength={32}
      placeholder="Enter display name"
    />
    <Button variant="outline" size="sm" class="h-8" onclick={onSave}>
      <PencilLine class="size-3.5" />
      Save
    </Button>
  </div>
</div>
