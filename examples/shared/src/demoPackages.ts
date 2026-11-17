// Which package each demo showcases, and the accent colour that makes it unmistakable on screen.
export const DEMO_PACKAGES = {
  react: { pkg: '@stacklatte/chart-react', platform: 'React · Next.js', renderer: 'HTML5 Canvas 2D', accent: '#2563eb' },
  angular: { pkg: '@stacklatte/chart-angular', platform: 'Angular', renderer: 'HTML5 Canvas 2D', accent: '#dd0031' },
  native: { pkg: '@stacklatte/chart-native', platform: 'React Native · iOS / Android', renderer: 'Skia (GPU)', accent: '#16a34a' },
} as const;
export type DemoPackageId = keyof typeof DEMO_PACKAGES;
