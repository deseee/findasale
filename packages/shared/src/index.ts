// Shared types and utilities will go here
export type Sale = {
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  lat?: number;
  lng?: number;
  photoUrls: string[];
  organizer: {
    id: string;
    businessName: string;
  };
  tags?: string[];
  isAuctionSale?: boolean;
};

export type Organizer = {
  id: string;
  name: string;
  email: string;
  phone: string;
};

export type User = {
  id: string;
  name: string;
  email: string;
};

export type AuthResponse = {
  user: Omit<User, 'password'>;
  token: string;
};

export type LoginCredentials = {
  email: string;
  password: string;
};

export type RegisterCredentials = {
  email: string;
  password: string;
  name: string;
  role: 'USER' | 'ORGANIZER' | 'ADMIN';
};
