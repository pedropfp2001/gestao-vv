import React, { useState, useEffect } from 'react';
import { USERS } from '../data/users';
import { User } from '../types';
import {
  KeyRound,
  Sparkles,
  CheckCircle2,
  Lock,
  ArrowRight,
  RefreshCw,
  Eye,
  EyeOff,
  AlertCircle,
  RotateCcw,
  Delete,
} from 'lucide-react';

interface LoginModalProps {
  currentUser: User | null;
  onSelectUser: (user: User) => void;
  isOpen: boolean;
  onClose?: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  currentUser,
  onSelectUser,
  isOpen,
  onClose,
}) => {
  const [users, setUsers] = useState<User[]>(USERS);
  const [selectedUser, setSelectedUser] = useState<User>(currentUser && currentUser.id ? currentUser : USERS[0]);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<'login' | 'change_pin'>('login');
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [changeError, setChangeError] = useState('');
  const [changeOk, setChangeOk] = useState('');

  useEffect(() => {
    if (isOpen) {
      let last = '';
      try { last = localStorage.getItem('vv_last_user_id') || ''; } catch {}
      const initial = (currentUser && currentUser.id ? currentUser : USERS.find((u) => u.id === last)) || USERS[0];
      setSelectedUser(initial);
      setPinInput(''); setPinError(''); setStep('login'); setChangeError(''); setChangeOk('');
      setOldPin(''); setNewPin(''); setConfirmPin('');
    }
  }, [isOpen, currentUser?.id]);

  const handleQuickSelect = (user: User) => { setSelectedUser(user); setPinInput(''); setPinError(''); };

  const handleLoginSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!pinInput || busy) return;
    setBusy(true); setPinError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: selectedUser.name, password: pinInput }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setPinError(data?.error || 'Não foi possível entrar.'); setPinInput(''); return; }
      try { localStorage.setItem('vv_last_user_id', selectedUser.id); } catch {}
      setPinInput('');
      onSelectUser(selectedUser);
    } catch {
      setPinError('Sem conexão com o servidor. Tente novamente.');
    } finally { setBusy(false); }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangeError(''); setChangeOk('');
    if (newPin.length < 4) return setChangeError('A nova senha deve ter pelo menos 4 caracteres.');
    if (newPin !== confirmPin) return setChangeError('A confirmação não confere com a nova senha.');
    setBusy(true);
    try {
      // entra primeiro com a senha atual para obter a sessão, depois troca
      const lr = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: selectedUser.name, password: oldPin }),
      });
      if (!lr.ok) { setChangeError((await lr.json().catch(() => ({})))?.error || 'Senha atual incorreta.'); return; }
      const res = await fetch('/api/auth/change-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: oldPin, newPassword: newPin }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setChangeError(data?.error || 'Não foi possível alterar a senha.'); return; }
      try { localStorage.setItem('vv_last_user_id', selectedUser.id); } catch {}
      onSelectUser(selectedUser);
    } catch { setChangeError('Sem conexão com o servidor.'); } finally { setBusy(false); }
  };

  const handleKeypadPress = (d: string) => setPinInput((p) => (p.length < 32 ? p + d : p));
  const handleKeypadBackspace = () => setPinInput((p) => p.slice(0, -1));
  const handlePinChange = (v: string) => { setPinInput(v.slice(0, 32)); setPinError(''); };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 my-auto">
        {/* Header */}
        <div className="bg-slate-900 text-white p-5 sm:p-6 relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center font-black text-xl text-white shadow-lg shadow-blue-500/30">
                VV
              </div>
              <div>
                <h2 className="text-lg sm:text-xl font-bold tracking-tight">Gestão de Pedidos</h2>
                <p className="text-xs text-slate-300">Selecione seu perfil para acessar o sistema</p>
              </div>
            </div>

            {onClose && currentUser && (
              <button
                onClick={onClose}
                className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800 transition-colors text-xs font-semibold"
                title="Fechar e continuar como usuário atual"
              >
                ✕ Fechar
              </button>
            )}
          </div>
        </div>

        <div className="p-5 sm:p-6 space-y-5">
          {step === 'login' && (
            <>
              {/* User Selection Cards */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                    1. Quem está acessando? (Clique no seu nome)
                  </label>
                  <span className="text-[11px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
                    {users.length} perfis disponíveis
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                  {users.map((user) => {
                    const isSelected = selectedUser.id === user.id;
                    return (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => handleQuickSelect(user)}
                        className={`relative p-3.5 rounded-2xl border text-center transition-all flex flex-col items-center justify-center gap-2 active:scale-95 ${
                          isSelected
                            ? 'border-blue-600 bg-blue-50/90 ring-3 ring-blue-500/30 shadow-md scale-[1.03] z-10'
                            : 'border-slate-200 hover:border-slate-300 bg-slate-50/60 hover:bg-slate-100/90'
                        }`}
                      >
                        <div
                          className={`w-12 h-12 rounded-2xl flex items-center justify-center font-extrabold text-base border shadow-xs transition-transform ${
                            isSelected
                              ? 'bg-blue-600 text-white border-blue-700'
                              : 'bg-slate-200 text-slate-700 border-slate-300'
                          }`}
                        >
                          {user.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div className="w-full">
                          <p className={`font-bold text-sm truncate ${isSelected ? 'text-blue-950 font-black' : 'text-slate-800'}`}>
                            {user.name}
                          </p>
                        </div>
                        {isSelected && (
                          <div className="absolute top-1.5 right-1.5 text-blue-600">
                            <CheckCircle2 className="w-4 h-4 fill-blue-600 text-white" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Form PIN for Selected User */}
              <form onSubmit={handleLoginSubmit} className="space-y-4 pt-1 border-t border-slate-100">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                      Digite a senha de{' '}
                      <strong className="text-blue-700 font-extrabold underline">{selectedUser.name}</strong>:
                    </label>
                  </div>

                  <div className="relative">
                    <input
                      type={showPin ? 'text' : 'password'}
                      value={pinInput}
                      onChange={(e) => handlePinChange(e.target.value)}
                      maxLength={32}
                      autoFocus
                      autoComplete="current-password"
                      className={`w-full pl-11 pr-12 py-3 rounded-2xl border text-center font-mono text-2xl tracking-[0.4em] font-bold focus:outline-none focus:ring-2 ${
                        pinError
                          ? 'border-red-500 ring-red-200 bg-red-50 text-red-900'
                          : 'border-slate-300 focus:ring-blue-500 focus:border-blue-500 bg-slate-50/40 focus:bg-white'
                      }`}
                      placeholder="••••"
                      required
                    />
                    <KeyRound className="w-5 h-5 text-slate-400 absolute left-3.5 top-3.5" />
                    <button
                      type="button"
                      onClick={() => setShowPin(!showPin)}
                      className="p-2 text-slate-400 hover:text-slate-600 absolute right-2.5 top-2.5 rounded-lg hover:bg-slate-100 transition-colors"
                      title={showPin ? 'Ocultar senha' : 'Ver senha'}
                    >
                      {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  {pinError && (
                    <div className="mt-2 p-2.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-bold">
                      {pinError}
                    </div>
                  )}
                </div>

                {/* Quick numeric virtual keypad for phones & tablets */}
                <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-200 sm:hidden">
                  <div className="grid grid-cols-3 gap-1.5">
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                      <button
                        key={digit}
                        type="button"
                        onClick={() => handleKeypadPress(digit)}
                        className="py-2.5 bg-white hover:bg-slate-100 active:bg-blue-100 text-slate-800 font-bold text-base rounded-xl border border-slate-200 shadow-2xs transition-all"
                      >
                        {digit}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setPinInput('')}
                      className="py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-600 font-bold text-xs rounded-xl"
                    >
                      Limpar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleKeypadPress('0')}
                      className="py-2.5 bg-white hover:bg-slate-100 active:bg-blue-100 text-slate-800 font-bold text-base rounded-xl border border-slate-200 shadow-2xs"
                    >
                      0
                    </button>
                    <button
                      type="button"
                      onClick={handleKeypadBackspace}
                      className="py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-600 font-bold text-xs rounded-xl flex items-center justify-center"
                    >
                      <Delete className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={() => setStep('change_pin')}
                    className="text-xs text-blue-600 hover:text-blue-800 font-semibold hover:underline flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" /> Alterar minha senha
                  </button>
                </div>

                <button
                  type="submit"
                  className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white font-extrabold rounded-2xl shadow-lg shadow-blue-600/25 transition-all flex items-center justify-center gap-2 text-sm"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>{busy ? 'Entrando...' : `Acessar Painel como ${selectedUser.name}`}</span>
                </button>
              </form>
            </>
          )}

          {/* STEP: Change PIN */}
          {step === 'change_pin' && (
            <form onSubmit={handleChangePassword} className="space-y-4 py-1">
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-600">
                Cadastre uma nova senha (4 a 32 caracteres) para <strong>{selectedUser.name}</strong>.
              </div>

              {changeError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl font-bold">
                  {changeError}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Senha atual</label>
                <input type="password" value={oldPin} onChange={(e) => setOldPin(e.target.value)} maxLength={32} autoFocus
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 font-mono text-center text-lg tracking-widest focus:ring-2 focus:ring-blue-500 focus:outline-none" placeholder="••••" required />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nova Senha
                </label>
                <input
                  type="password"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
                  maxLength={32}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 font-mono text-center text-lg tracking-widest focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  placeholder="••••"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Confirme a Nova Senha
                </label>
                <input
                  type="password"
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value)}
                  maxLength={32}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 font-mono text-center text-lg tracking-widest focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  placeholder="••••"
                  required
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setStep('login')}
                  className="w-1/3 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs"
                >
                  Voltar
                </button>
                <button
                  type="submit"
                  className="w-2/3 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-md shadow-blue-600/20 flex items-center justify-center gap-2"
                >
                  <span>{busy ? 'Salvando...' : 'Salvar e Entrar'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
