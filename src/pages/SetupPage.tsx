import { useRivalRadarStore } from '@/store/rivalradar';
import { useNavigate } from 'react-router-dom';
import { Logo } from '@/components/Logo';
import { useState } from 'react';
import { ArrowRight, Plus, Trash2 } from 'lucide-react';

const SetupPage = () => {
  const { project, loadMockData } = useRivalRadarStore();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [businessName, setBusinessName] = useState('');
  const [businessUrl, setBusinessUrl] = useState('');
  const [primaryService, setPrimaryService] = useState('');
  const [location, setLocation] = useState('');
  const [competitors, setCompetitors] = useState([{ name: '', url: '' }]);

  // Redirect if project exists
  if (project) {
    navigate('/dashboard');
    return null;
  }

  const addCompetitor = () => {
    if (competitors.length < 5) {
      setCompetitors([...competitors, { name: '', url: '' }]);
    }
  };

  const removeCompetitor = (i: number) => {
    setCompetitors(competitors.filter((_, idx) => idx !== i));
  };

  const handleDemo = () => {
    loadMockData();
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-8">
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <Logo />
          </div>
          <h1 className="text-2xl font-semibold text-foreground">Set up your competitive radar</h1>
          <p className="text-sm text-muted-foreground mt-1">Enter your business details and competitors to start scanning.</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2">
          {[1, 2].map((s) => (
            <div
              key={s}
              className={`w-8 h-1 rounded-full ${step >= s ? 'bg-primary' : 'bg-border'}`}
            />
          ))}
        </div>

        {step === 1 && (
          <div className="card-surface space-y-4">
            <h2 className="text-sm font-semibold text-foreground">Your Business</h2>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Business Name</label>
              <input
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="e.g. Apex Builders"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Website URL</label>
              <input
                value={businessUrl}
                onChange={(e) => setBusinessUrl(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="https://yourbusiness.co.uk"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Primary Service</label>
              <input
                value={primaryService}
                onChange={(e) => setPrimaryService(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="e.g. building contractor"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Location</label>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="e.g. Manchester"
              />
            </div>
            <button
              onClick={() => setStep(2)}
              disabled={!businessName || !businessUrl}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              Next <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="card-surface space-y-4">
            <h2 className="text-sm font-semibold text-foreground">Your Competitors</h2>
            <p className="text-xs text-muted-foreground">Add up to 5 competitors to track.</p>
            {competitors.map((comp, i) => (
              <div key={i} className="flex gap-2">
                <input
                  value={comp.name}
                  onChange={(e) => {
                    const c = [...competitors];
                    c[i].name = e.target.value;
                    setCompetitors(c);
                  }}
                  className="flex-1 px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="Competitor name"
                />
                <input
                  value={comp.url}
                  onChange={(e) => {
                    const c = [...competitors];
                    c[i].url = e.target.value;
                    setCompetitors(c);
                  }}
                  className="flex-1 px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="https://competitor.co.uk"
                />
                {competitors.length > 1 && (
                  <button onClick={() => removeCompetitor(i)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
            {competitors.length < 5 && (
              <button onClick={addCompetitor} className="text-sm text-primary font-medium flex items-center gap-1 hover:opacity-80">
                <Plus className="w-4 h-4" /> Add competitor
              </button>
            )}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setStep(1)}
                className="px-4 py-2.5 rounded-lg bg-muted text-foreground text-sm font-medium hover:bg-muted/80"
              >
                Back
              </button>
              <button
                onClick={handleDemo}
                className="flex-1 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
              >
                Start Scanning
              </button>
            </div>
          </div>
        )}

        <div className="text-center">
          <button
            onClick={handleDemo}
            className="text-sm text-primary font-medium hover:underline"
          >
            Skip setup → Try with demo data
          </button>
        </div>
      </div>
    </div>
  );
};

export default SetupPage;
