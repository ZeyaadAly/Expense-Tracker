export interface ProfileResource {
  userId: string;
  displayName: string | null;
  preferredCurrency: "EGP";
  locale: "en";
  timezone: "Africa/Cairo";
  createdAt: string;
  updatedAt: string;
}
export interface ProfileInput { displayName: string | null }
