export function dailyUsageText(usage) {
  if (!usage || !Number.isInteger(usage.submitted) || usage.submitted < 0 ||
      usage.daily_limit !== 20 || !/^\d{4}-\d{2}-\d{2}$/.test(usage.central_day || '')) {
    throw new Error('Invalid daily usage');
  }
  const remaining = Math.max(0, usage.daily_limit - usage.submitted);
  return `Today (${usage.central_day}, Central Time): ${usage.submitted} submitted · ${remaining} remaining of ${usage.daily_limit}. Includes reruns; resets at midnight Central Time.`;
}
