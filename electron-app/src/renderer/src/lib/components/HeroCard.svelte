<script lang="ts">
  import type { Snippet } from "svelte";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import * as Card from "$lib/components/ui/card/index.js";

  let {
    connectionState = "idle",
    children,
  }: {
    connectionState?: string;
    children?: Snippet;
  } = $props();

  let badgeVariant: "default" | "outline" = $derived(
    connectionState === "connected" ? "default" : "outline",
  );
</script>

<Card.Root size="sm" class="border-border bg-card">
  <Card.Header>
    <div class="flex items-center justify-between gap-3">
      <div class="min-w-0">
        <Card.Title class="text-base leading-tight text-foreground"
          >Room Sync</Card.Title
        >
        <Card.Description
          class="mt-0.5 text-xs leading-4 text-muted-foreground"
        >
          Sync avatar parameters in real time.
        </Card.Description>
      </div>
      <Badge variant={badgeVariant} class="shrink-0 capitalize">
        {connectionState}
      </Badge>
    </div>
  </Card.Header>
  {#if children}
    <Card.Content>
      {@render children()}
    </Card.Content>
  {/if}
</Card.Root>
