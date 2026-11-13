<script setup>
import AbilityCatalogPage from './AbilityCatalogPage.vue';
defineProps({ active: Boolean, catalogVersions: Object });
</script>
<template><AbilityCatalogPage kind="spells" :active="active" :catalog-versions="catalogVersions" /></template>
