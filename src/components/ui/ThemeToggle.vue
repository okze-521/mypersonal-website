<template>
  <button @click="toggle" class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition text-lg" :title="isDark ? '切换到亮色模式' : '切换到暗黑模式'">
    <span v-if="isDark">☀️</span>
    <span v-else>🌙</span>
  </button>
</template>

<script setup>
import { ref, onMounted } from 'vue';

const isDark = ref(false);

onMounted(() => {
  isDark.value = document.documentElement.classList.contains('dark');
});

function toggle() {
  isDark.value = !isDark.value;
  document.documentElement.classList.toggle('dark');
  localStorage.setItem('theme', isDark.value ? 'dark' : 'light');
}
</script>
