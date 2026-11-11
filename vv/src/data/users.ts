import { User } from '../types';

// Perfis de acesso. As senhas ficam SOMENTE no servidor (nunca no navegador).
export const USERS: User[] = [
  { id: 'u1', name: 'Pedro', role: 'admin', avatar: '' },
  { id: 'u2', name: 'Daniel', role: 'admin', avatar: '' },
  { id: 'u3', name: 'Igor', role: 'admin', avatar: '' },
  { id: 'u4', name: 'Ricardo', role: 'vendedor', avatar: '' },
  { id: 'u5', name: 'Wanderley', role: 'vendedor', avatar: '' },
];
