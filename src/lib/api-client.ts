export const dashboardHeaders: Record<string, string> = {
  'x-dashboard-secret': process.env.NEXT_PUBLIC_DASHBOARD_SECRET ?? '',
};
