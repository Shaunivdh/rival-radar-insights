'use client';

import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  User,
  CreditCard,
  Shield,
  Building2,
  Globe,
  Tag,
  Check,
  Crown,
  Download,
  Trash2,
  KeyRound,
  AlertTriangle,
  RefreshCw,
  Store,
  CheckCircle,
} from 'lucide-react';
import { useRivalRadarStore } from '@/store/rivalradar';
import { isValidUKPostcode } from '@/lib/utils';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { rescanAll } from '@/actions/projects';
import { SERVICE_CATEGORY_OPTIONS, type ServiceCategory } from '@/lib/serviceCategories';

type FieldErrors = Partial<Record<'primaryService' | 'location' | 'postcode', string>>;

const SettingsPage = () => {
  const { settings, setSettings, deleteProject, project, user } = useRivalRadarStore();
  const router = useRouter();
  const [form, setForm] = useState(settings);
  const [rescanning, setRescanning] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saved, setSaved] = useState(false);
  const [gbpConnected, setGbpConnected] = useState<boolean | null>(null);

  const biz = project?.ownBusiness;
  const initials = user?.email?.slice(0, 2).toUpperCase() ?? 'MJ';

  useEffect(() => {
    fetch('/api/gbp/status')
      .then((r) => r.json())
      .then((d) => setGbpConnected(d.connected))
      .catch(() => {});
  }, []);

  const handleSave = () => {
    const newErrors: FieldErrors = {};
    if (!form.primaryService?.trim()) newErrors.primaryService = 'Primary Service is required';
    if (!form.location?.trim()) newErrors.location = 'Location is required';
    if (form.postcode?.trim() && !isValidUKPostcode(form.postcode))
      newErrors.postcode = 'Enter a valid UK postcode (e.g. SW1A 1AA)';
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    setErrors({});
    setSettings(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleDelete = () => {
    if (confirm('Are you sure you want to delete the project? This cannot be undone.')) {
      deleteProject();
      router.push('/');
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <div className="mb-8">
        <h1 className="font-display text-3xl lg:text-4xl font-bold mb-2">Settings</h1>
        <p className="text-muted-foreground">Manage your account, business profile, and billing.</p>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList
          className="bg-card border-0 p-1 h-auto"
          style={{ boxShadow: 'var(--neu-shadow)' }}
        >
          <TabsTrigger
            value="profile"
            className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg px-4 py-2"
          >
            <User className="w-4 h-4" />
            Profile
          </TabsTrigger>
          <TabsTrigger
            value="business"
            className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg px-4 py-2"
          >
            <Building2 className="w-4 h-4" />
            Business
          </TabsTrigger>
          <TabsTrigger
            value="billing"
            className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg px-4 py-2"
          >
            <CreditCard className="w-4 h-4" />
            Billing
          </TabsTrigger>
          <TabsTrigger
            value="security"
            className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg px-4 py-2"
          >
            <Shield className="w-4 h-4" />
            Security
          </TabsTrigger>
        </TabsList>

        {/* Profile */}
        <TabsContent value="profile" className="space-y-6">
          <Card className="border-0" style={{ boxShadow: 'var(--neu-shadow)' }}>
            <CardHeader>
              <CardTitle className="text-xl">Your profile</CardTitle>
              <CardDescription>This is how you appear inside Scoutly.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-center gap-5">
                <div className="w-20 h-20 rounded-full bg-gradient-hero flex items-center justify-center text-primary-foreground font-display text-2xl font-bold">
                  {initials}
                </div>
                <div>
                  <Button variant="outline" size="sm">
                    Upload photo
                  </Button>
                  <p className="text-xs text-muted-foreground mt-2">PNG or JPG, max 2MB</p>
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <Label htmlFor="fname">First name</Label>
                  <Input id="fname" placeholder="First name" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lname">Last name</Label>
                  <Input id="lname" placeholder="Last name" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" defaultValue={user?.email ?? ''} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" placeholder="Phone number" />
                </div>
              </div>
              <div className="flex justify-end">
                <Button variant="hero">Save changes</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Business */}
        <TabsContent value="business" className="space-y-6">
          <Card className="border-0" style={{ boxShadow: 'var(--neu-shadow)' }}>
            <CardHeader>
              <CardTitle className="text-xl">Business profile</CardTitle>
              <CardDescription>
                Used to crawl your site and match local search rankings.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid md:grid-cols-2 gap-5">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="bname">Business name</Label>
                  <Input id="bname" defaultValue={biz?.name ?? ''} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="website">Website</Label>
                  <div className="relative">
                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input id="website" defaultValue={biz?.url ?? ''} className="pl-10" />
                  </div>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="primaryService">Business category</Label>
                  <div className="relative">
                    <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10 pointer-events-none" />
                    <select
                      id="primaryService"
                      value={form.primaryService ?? ''}
                      onChange={(e) => {
                        setForm({ ...form, primaryService: e.target.value as ServiceCategory });
                        if ('primaryService' in errors) {
                          const { primaryService: _, ...rest } = errors;
                          setErrors(rest);
                        }
                      }}
                      className="flex h-10 w-full rounded-md border border-input bg-background pl-10 pr-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <option value="" disabled>
                        Pick the closest match
                      </option>
                      {SERVICE_CATEGORY_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {errors.primaryService && (
                    <p className="text-xs text-destructive">{errors.primaryService}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="city">Town / City</Label>
                  <Input
                    id="city"
                    placeholder="Manchester"
                    defaultValue={form.location ?? ''}
                    onChange={(e) => {
                      setForm({ ...form, location: e.target.value });
                      if ('location' in errors) {
                        const { location: _, ...rest } = errors;
                        setErrors(rest);
                      }
                    }}
                  />
                  {errors.location && <p className="text-xs text-destructive">{errors.location}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="postcode">Postcode</Label>
                  <Input
                    id="postcode"
                    placeholder="M1 4PQ"
                    defaultValue={form.postcode ?? ''}
                    onChange={(e) => {
                      setForm({ ...form, postcode: e.target.value.toUpperCase() });
                      if ('postcode' in errors) {
                        const { postcode: _, ...rest } = errors;
                        setErrors(rest);
                      }
                    }}
                  />
                  {errors.postcode && <p className="text-xs text-destructive">{errors.postcode}</p>}
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="gbp">Google Business Profile</Label>
                  {gbpConnected === null ? (
                    <p className="text-xs text-muted-foreground">Checking connection...</p>
                  ) : gbpConnected ? (
                    <div className="flex items-center justify-between p-3 rounded-lg bg-success/5 border border-success/20">
                      <div className="flex items-center gap-2 text-sm text-success">
                        <CheckCircle className="w-4 h-4" />
                        Connected
                      </div>
                      <a href="/google-business" className="text-xs text-primary hover:underline">
                        Manage
                      </a>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Store className="w-4 h-4" />
                        Not connected
                      </div>
                      <a
                        href="/api/auth/google-business"
                        className="px-3 py-1.5 bg-primary text-primary-foreground text-xs font-medium rounded-lg hover:opacity-90"
                      >
                        Connect
                      </a>
                    </div>
                  )}
                </div>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-sm">Re-crawl frequency</p>
                  <p className="text-xs text-muted-foreground">
                    We currently crawl your site weekly.
                  </p>
                </div>
                <Badge className="bg-score-excellent/10 text-score-excellent border-0">
                  Weekly
                </Badge>
              </div>
              <div className="flex justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  disabled={rescanning || !project}
                  onClick={async () => {
                    if (!project) return;
                    setRescanning(true);
                    await rescanAll(project.id);
                    setRescanning(false);
                    router.push('/dashboard');
                  }}
                >
                  <RefreshCw className={`w-4 h-4 ${rescanning ? 'animate-spin' : ''}`} />
                  {rescanning ? 'Starting...' : 'Re-scan now'}
                </Button>
                <Button variant="hero" onClick={handleSave}>
                  {saved ? 'Saved!' : 'Save business'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Billing */}
        <TabsContent value="billing" className="space-y-6">
          <Card className="border-0 overflow-hidden" style={{ boxShadow: 'var(--neu-shadow)' }}>
            <div className="bg-gradient-hero p-6 text-primary-foreground">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Crown className="w-5 h-5" />
                    <span className="text-sm font-semibold opacity-90">Current plan</span>
                  </div>
                  <h3 className="font-display text-2xl font-bold">Scoutly Pro</h3>
                  <p className="text-sm opacity-90 mt-1">Billing details coming soon</p>
                </div>
                <Button variant="secondary" size="sm">
                  Change plan
                </Button>
              </div>
            </div>
            <CardContent className="p-6 grid md:grid-cols-3 gap-4">
              {[
                'Up to 5 competitors tracked',
                'Weekly site crawl',
                'Full action plan + AI replies',
                'Google reviews monitoring',
                'Email + in-app alerts',
                'Priority support',
              ].map((f) => (
                <div key={f} className="flex items-start gap-2 text-sm">
                  <Check className="w-4 h-4 text-score-excellent shrink-0 mt-0.5" />
                  <span>{f}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-0" style={{ boxShadow: 'var(--neu-shadow)' }}>
            <CardHeader>
              <CardTitle className="text-lg">Payment method</CardTitle>
              <CardDescription>No payment method on file yet.</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Payment integration coming soon.</p>
              <Button variant="outline" size="sm">
                Add card
              </Button>
            </CardContent>
          </Card>

          <Card className="border-0" style={{ boxShadow: 'var(--neu-shadow)' }}>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-lg">Invoice history</CardTitle>
              <Button variant="ghost" size="sm" className="gap-2">
                <Download className="w-4 h-4" />
                Download all
              </Button>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">No invoices yet.</p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security */}
        <TabsContent value="security" className="space-y-6">
          <Card className="border-0" style={{ boxShadow: 'var(--neu-shadow)' }}>
            <CardHeader>
              <CardTitle className="text-xl">Password</CardTitle>
              <CardDescription>
                Use 12+ characters with a mix of letters and numbers.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 max-w-md">
              <div className="space-y-2">
                <Label htmlFor="cur">Current password</Label>
                <Input id="cur" type="password" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new">New password</Label>
                <Input id="new" type="password" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="conf">Confirm new password</Label>
                <Input id="conf" type="password" />
              </div>
              <Button variant="hero" className="gap-2">
                <KeyRound className="w-4 h-4" />
                Update password
              </Button>
            </CardContent>
          </Card>

          <Card className="border-0" style={{ boxShadow: 'var(--neu-shadow)' }}>
            <CardHeader>
              <CardTitle className="text-xl">Two-factor authentication</CardTitle>
              <CardDescription>Protect your account with a second step at sign-in.</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Shield className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">2FA is currently off</p>
                  <p className="text-xs text-muted-foreground">
                    We strongly recommend turning it on.
                  </p>
                </div>
              </div>
              <Button variant="outline">Enable 2FA</Button>
            </CardContent>
          </Card>

          <Card
            className="border-0 border-l-4 border-l-destructive"
            style={{ boxShadow: 'var(--neu-shadow)' }}
          >
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-destructive" />
                Danger zone
              </CardTitle>
              <CardDescription>These actions can&apos;t be undone.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Export my data</p>
                  <p className="text-xs text-muted-foreground">
                    Download everything we have on your business.
                  </p>
                </div>
                <Button variant="outline" size="sm" className="gap-2">
                  <Download className="w-4 h-4" />
                  Export
                </Button>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-destructive">Delete account</p>
                  <p className="text-xs text-muted-foreground">
                    Permanently remove your account and all data.
                  </p>
                </div>
                <Button variant="destructive" size="sm" className="gap-2" onClick={handleDelete}>
                  <Trash2 className="w-4 h-4" />
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
};

export default SettingsPage;
