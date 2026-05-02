<script setup>
import { computed, inject, defineAsyncComponent } from 'vue'
import { useDisplay } from 'vuetify'

const emit = defineEmits(['toggle-sidebar'])

const services        = inject('services')
const toolbarRegistry = services.get('toolbar.registry')
const { mobile }      = useDisplay()

function visibleItems(placement) {
  return toolbarRegistry.items
    .filter(i => {
      if (i.placement !== placement) return false
      if (i.show != null && !i.show()) return false
      if (i.hideOnMobile && mobile.value) return false
      return true
    })
    .sort((a, b) => {
      const ga = toolbarRegistry.groups.find(g => g.id === a.group)?.priority ?? 99
      const gb = toolbarRegistry.groups.find(g => g.id === b.group)?.priority ?? 99
      if (ga !== gb) return ga - gb
      return (a.priority ?? 50) - (b.priority ?? 50)
    })
}

const leftItems  = computed(() => visibleItems('left'))
const rightItems = computed(() => visibleItems('right'))

function groupsFor(items) {
  const seen = []
  const out  = []
  for (const item of items) {
    if (!seen.includes(item.group)) {
      seen.push(item.group)
      out.push({ id: item.group, items: items.filter(i => i.group === item.group) })
    }
  }
  return out
}

const leftGroups  = computed(() => groupsFor(leftItems.value))
const rightGroups = computed(() => groupsFor(rightItems.value))

function groupDivider(groupId) {
  return toolbarRegistry.groups.find(g => g.id === groupId)?.divider ?? false
}

function resolveComponent(item) {
  if (typeof item.component === 'function') return defineAsyncComponent(item.component)
  return item.component
}
</script>

<template>
  <v-app-bar-nav-icon @click="$emit('toggle-sidebar')" />

  <!-- Left groups -->
  <template v-for="group in leftGroups" :key="group.id">
    <template v-for="item in group.items" :key="item.id">
      <!-- custom -->
      <component :is="resolveComponent(item)" v-if="item.type === 'custom'" />

      <!-- button -->
      <v-btn
        v-else-if="item.type === 'button'"
        icon
        size="small"
        class="mr-1"
        @click="item.execute()"
      >
        <v-icon size="20">{{ item.icon }}</v-icon>
        <v-tooltip v-if="item.tooltip || item.label" activator="parent">
          {{ item.tooltip ? item.tooltip() : item.label() }}
        </v-tooltip>
      </v-btn>

      <!-- toggle (standalone) -->
      <v-btn
        v-else-if="item.type === 'toggle'"
        icon
        size="small"
        class="mr-1"
        :color="item.active?.() ? 'primary' : undefined"
        @click="item.execute()"
      >
        <v-icon size="20">{{ item.icon }}</v-icon>
        <v-tooltip v-if="item.tooltip || item.label" activator="parent">
          {{ item.tooltip ? item.tooltip() : item.label() }}
        </v-tooltip>
      </v-btn>

      <!-- dropdown -->
      <v-menu v-else-if="item.type === 'dropdown'" :close-on-content-click="false" location="bottom end">
        <template #activator="{ props: menuProps }">
          <v-btn icon size="small" class="mr-1" :color="item.active?.() ? 'primary' : undefined" v-bind="menuProps">
            <v-icon size="20">{{ item.icon }}</v-icon>
            <v-tooltip v-if="item.tooltip || item.label" activator="parent">
              {{ item.tooltip ? item.tooltip() : item.label() }}
            </v-tooltip>
          </v-btn>
        </template>
        <v-list density="compact" min-width="160">
          <template v-for="sub in (item.items?.() ?? [])" :key="sub.id">
            <v-divider v-if="sub.divider" />
            <v-list-item
              v-else
              :title="sub.label"
              :active="sub.active?.()"
              color="primary"
              rounded="lg"
              @click="sub.execute()"
            >
              <template v-if="sub.icon" #prepend>
                <v-icon size="18">{{ sub.icon }}</v-icon>
              </template>
              <template v-if="sub.appendIcon" #append>
                <v-icon size="16">{{ sub.appendIcon?.() }}</v-icon>
              </template>
            </v-list-item>
          </template>
        </v-list>
      </v-menu>
    </template>
    <v-divider v-if="groupDivider(group.id)" vertical class="mx-1" style="height:24px; align-self:center" />
  </template>

  <v-spacer />

  <!-- Right groups (reversed so priority=low is rightmost) -->
  <template v-for="group in rightGroups" :key="group.id">
    <v-divider v-if="groupDivider(group.id)" vertical class="mx-1" style="height:24px; align-self:center" />

    <!-- toggle group (same group, all toggles → btn-toggle) -->
    <v-btn-toggle
      v-if="group.items.every(i => i.type === 'toggle')"
      density="compact"
      rounded="lg"
      color="primary"
      class="mr-1"
      mandatory
      :model-value="group.items.find(i => i.active?.())?.id"
      @update:model-value="v => group.items.find(i => i.id === v)?.execute()"
    >
      <v-btn
        v-for="tog in group.items"
        :key="tog.id"
        size="small"
        :value="tog.id"
      >
        <v-icon size="18">{{ tog.icon }}</v-icon>
        <v-tooltip activator="parent">{{ tog.label?.() }}</v-tooltip>
      </v-btn>
    </v-btn-toggle>

    <template v-else v-for="item in group.items" :key="item.id">
      <component :is="resolveComponent(item)" v-if="item.type === 'custom'" />

      <v-btn
        v-else-if="item.type === 'button'"
        icon size="small" class="mr-1"
        @click="item.execute()"
      >
        <v-icon size="20">{{ item.icon }}</v-icon>
        <v-tooltip v-if="item.tooltip || item.label" activator="parent">
          {{ item.tooltip ? item.tooltip() : item.label() }}
        </v-tooltip>
      </v-btn>

      <v-btn
        v-else-if="item.type === 'toggle'"
        icon size="small" class="mr-1"
        :color="item.active?.() ? 'primary' : undefined"
        @click="item.execute()"
      >
        <v-icon size="20">{{ item.icon }}</v-icon>
        <v-tooltip v-if="item.tooltip || item.label" activator="parent">
          {{ item.tooltip ? item.tooltip() : item.label() }}
        </v-tooltip>
      </v-btn>

      <v-menu v-else-if="item.type === 'dropdown'" :close-on-content-click="false" location="bottom end">
        <template #activator="{ props: menuProps }">
          <v-btn icon size="small" class="mr-1" :color="item.active?.() ? 'primary' : undefined" v-bind="menuProps">
            <v-icon size="20">{{ item.icon }}</v-icon>
            <v-tooltip v-if="item.tooltip || item.label" activator="parent">
              {{ item.tooltip ? item.tooltip() : item.label() }}
            </v-tooltip>
          </v-btn>
        </template>
        <v-list density="compact" min-width="160">
          <template v-for="sub in (item.items?.() ?? [])" :key="sub.id">
            <v-divider v-if="sub.divider" />
            <v-list-item
              v-else
              :title="sub.label"
              :active="sub.active?.()"
              color="primary"
              rounded="lg"
              @click="sub.execute()"
            >
              <template v-if="sub.icon" #prepend>
                <v-icon size="18">{{ sub.icon }}</v-icon>
              </template>
            </v-list-item>
          </template>
        </v-list>
      </v-menu>
    </template>
  </template>
</template>
