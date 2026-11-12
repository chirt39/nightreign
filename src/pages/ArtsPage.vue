<script setup>
import { ref } from 'vue';
import AbilityCatalogPage from './AbilityCatalogPage.vue';
defineProps({ active: Boolean, catalogVersions: Object });
const page = ref(null);
defineExpose({ restoreNavigation: snapshot => page.value?.restoreNavigation(snapshot) });
</script>
<template><AbilityCatalogPage ref="page" kind="arts" :active="active" :catalog-versions="catalogVersions" /></template>
