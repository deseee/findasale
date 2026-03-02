// Shared types and utilities will go here
export type Sale = {
  id: string;
  title: string;
  description: string;
  date: Date;
  location: string;
  organizerId: string;
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
