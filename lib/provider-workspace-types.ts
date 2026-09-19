type ProviderWorkspaceAppointment = {
  id: string;
  studentName: string;
  startsAt: string;
  status: "pending" | "scheduled" | "declined" | "cancelled";
  createdAt: string;
};

export type ProviderSetupData = {
  profile: {
    displayName: string;
    professionalTitle: string;
    timeZone: string;
    defaultAppointmentDurationMinutes: number;
    minimumBookingNoticeMinutes: number;
    restBetweenSessionsMinutes: number;
  };
  bookingPage: {
    id: string;
    slug: string;
    title: string;
    timeZone: string;
    appointmentDurationMinutes: number;
    bookingIntervalMinutes: number;
    minimumNoticeHours: number;
    weeklyRescheduleLimit: number;
    isPublished: boolean;
  };
};

export type ProviderDashboardData = ProviderSetupData & {
  upcomingAppointments: ProviderWorkspaceAppointment[];
  recentBookings: ProviderWorkspaceAppointment[];
  openTimesThisWeek: Array<{
    startsAt: string;
    endsAt: string;
    localized: { en: string; tr: string };
  }>;
};
