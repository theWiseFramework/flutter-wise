export const RECOMMENDED_FILES_EXCLUDE: Record<string, boolean> = {
  "**/.dart_tool/**": true,
  "**/.flutter-plugins": true,
  "**/.flutter-plugins-dependencies": true,
  "**/.packages": true,
  "**/build/**": true,
  "**/.idea/**": true,
  ".metadata": true,
  "*.iml": true,
  "*.lock": true,
  "**/android/.kotlin/**": true,
  "**/android/.gradle/**": true,
  "**/android/gradle/**": true,
  "**/android/gradlew.bat": true,
  "**/android/**/*.iml": true,
  "**/android/gradlew": true,
  "**/android/gradle.properties": true,
  "**/android/.gitignore": true,
  "**/android/local.properties": true,
};

export const RECOMMENDED_SEARCH_EXCLUDE: Record<string, boolean> = {
  "**/.dart_tool/**": true,
  "**/build/**": true,
  "**/android/.kotlin/**": true,
  "**/android/.gradle/**": true,
  "**/android/gradle/**": true,
  "**/android/gradlew.bat": true,
};
