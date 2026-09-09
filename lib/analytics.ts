export type VoterSummary = {
  viewer_id: string;
  name: string;
  points: number;
  votes: number;
  rank: number;
  country: string;
};
export type DonationSummary = {
  id: string;
  viewer_id: string;
  name: string;
  time: number;
  amount_micros: string;
  currency: string;
  comment: string;
  country: string | null;
  usd_micros: number | null;
  rate: string | null;
  rate_date: string | null;
};
export type StreamAnalytics = {
  stream: {
    id: string;
    title: string;
    tracked_from: number;
    partial: number;
  } | null;
  voters: VoterSummary[];
  donors: {
    viewer_id: string;
    name: string;
    donations: number;
    usd_micros: number;
    pending: number;
  }[];
  countries: {
    country: string | null;
    donations: number;
    usd_micros: number;
    pending: number;
  }[];
  donations: DonationSummary[];
  totals: { donations: number; usd_micros: number; pending: number };
  donorPage: number;
  donationPage: number;
  hasMoreDonors: boolean;
  hasMoreDonations: boolean;
};
