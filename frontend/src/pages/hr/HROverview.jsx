import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Building2, Calendar, Clock } from 'lucide-react';
import { PageLoader } from '../../components/common/index';
import api from '../../utils/api';
import { formatNumber } from '../../utils/formatters';

export default function HROverview() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => { try { const r = await api.get('/hr/overview'); setData(r?.data); } catch {} finally { setLoading(false); } })();
  }, []);

  if (loading) return <PageLoader />;

  const cards = [
    { title: 'Employees', icon: Users, color: 'from-blue-500 to-blue-600', value: formatNumber(data?.employees?.active || 0), sub: `${data?.employees?.total || 0} total`, link: '/hr/employees' },
    { title: 'Departments', icon: Building2, color: 'from-violet-500 to-violet-600', value: formatNumber(data?.departments?.total || 0), sub: 'Active departments', link: '/hr/employees' },
    { title: 'Leave Requests', icon: Calendar, color: 'from-amber-500 to-amber-600', value: formatNumber(data?.leave?.pending || 0), sub: `${data?.leave?.approved || 0} approved`, link: '/hr/leave' },
    { title: 'Attendance Today', icon: Clock, color: 'from-emerald-500 to-emerald-600', value: formatNumber(data?.attendance?.present || 0), sub: 'Present today', link: '/hr/attendance' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><div><h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Human Resources</h1><p className="text-sm text-gray-400 mt-1">Employee management overview</p></div></div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {cards.map((c, i) => (
          <div key={i} onClick={() => navigate(c.link)} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-5 cursor-pointer hover:shadow-card transition-all">
            <div className="flex items-center gap-3 mb-3"><div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${c.color} flex items-center justify-center`}><c.icon className="w-5 h-5 text-white" /></div><h3 className="text-sm font-semibold text-gray-900">{c.title}</h3></div>
            <p className="text-2xl font-display font-bold text-gray-900">{c.value}</p>
            <p className="text-xs text-gray-400 mt-1">{c.sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
