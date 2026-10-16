/** New-shop onboarding: full screen on the grouped gray page, no office navigation. */
export default function OnboardingLayout({ children }: LayoutProps<"/">) {
  return <main className="flex min-h-dvh flex-1 flex-col bg-bg">{children}</main>;
}
