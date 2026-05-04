'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Store, CheckCircle, AlertCircle, Star, MessageSquare, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import type { GBPAccount, GBPLocation, GBPReview } from '@/services/gbp';
import { STAR_MAP } from '@/services/gbp';

interface GBPStatus {
  connected: boolean;
  accountName: string | null;
  locationName: string | null;
  connectedAt: string | null;
}

interface AccountWithLocations extends GBPAccount {
  locations: GBPLocation[];
}

function StarRating({ rating }: { rating: string }) {
  const n = STAR_MAP[rating] ?? 0;
  return (
    <span className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`w-3.5 h-3.5 ${i < n ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'}`}
        />
      ))}
    </span>
  );
}

function ReviewCard({ review }: { review: GBPReview }) {
  const [replyText, setReplyText] = useState(review.reviewReply?.comment ?? '');
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [currentReply, setCurrentReply] = useState(review.reviewReply ?? null);
  const [replyError, setReplyError] = useState<string | null>(null);

  const reviewId = review.reviewId || review.name.split('/').pop()!;

  const handleReply = async () => {
    if (!replyText.trim()) return;
    setSubmitting(true);
    setReplyError(null);
    try {
      const res = await fetch('/api/gbp/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reply', reviewId, comment: replyText }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setReplyError(d.error ?? 'Failed to submit reply');
      } else {
        const data = await res.json();
        setCurrentReply({ comment: replyText, updateTime: data.updateTime ?? new Date().toISOString() });
        setEditing(false);
      }
    } catch {
      setReplyError('Network error — please try again');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this reply?')) return;
    setSubmitting(true);
    setReplyError(null);
    try {
      const res = await fetch('/api/gbp/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_reply', reviewId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setReplyError(d.error ?? 'Failed to delete reply');
      } else {
        setCurrentReply(null);
        setReplyText('');
      }
    } catch {
      setReplyError('Network error — please try again');
    } finally {
      setSubmitting(false);
    }
  };

  const date = new Date(review.createTime).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div className="card-surface space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">
            {review.reviewer.isAnonymous ? 'Anonymous' : review.reviewer.displayName}
          </p>
          <div className="flex items-center gap-2">
            <StarRating rating={review.starRating} />
            <span className="text-xs text-muted-foreground">{date}</span>
          </div>
        </div>
      </div>

      {review.comment && (
        <p className="text-sm text-foreground leading-relaxed">{review.comment}</p>
      )}

      {currentReply && !editing && (
        <div className="pl-3 border-l-2 border-primary/30 space-y-1">
          <p className="text-xs font-medium text-primary">Your reply</p>
          <p className="text-sm text-muted-foreground">{currentReply.comment}</p>
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => { setReplyText(currentReply.comment); setEditing(true); }}
              className="text-xs text-primary hover:underline"
            >
              Edit
            </button>
            <button
              onClick={handleDelete}
              disabled={submitting}
              className="text-xs text-destructive hover:underline disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {replyError && (
        <p className="text-xs text-destructive">{replyError}</p>
      )}

      {(!currentReply || editing) && (
        <div className="space-y-2">
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Write a reply…"
            rows={3}
            className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={handleReply}
              disabled={submitting || !replyText.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground text-xs font-medium rounded-lg hover:opacity-90 disabled:opacity-50"
            >
              {submitting && <Loader2 className="w-3 h-3 animate-spin" />}
              {currentReply ? 'Update reply' : 'Reply'}
            </button>
            {editing && (
              <button
                onClick={() => { setEditing(false); setReplyText(currentReply?.comment ?? ''); }}
                className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function GoogleBusinessPage() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<GBPStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<AccountWithLocations[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [savingLocation, setSavingLocation] = useState(false);
  const [reviews, setReviews] = useState<GBPReview[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [totalReviews, setTotalReviews] = useState<number | null>(null);
  const [avgRating, setAvgRating] = useState<number | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [expandedAccount, setExpandedAccount] = useState<string | null>(null);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [disconnectError, setDisconnectError] = useState<string | null>(null);
  const [reviewsError, setReviewsError] = useState<string | null>(null);

  const flash = searchParams.get('gbp');

  const fetchStatus = useCallback(async () => {
    const res = await fetch('/api/gbp/status');
    if (res.ok) setStatus(await res.json());
    setLoading(false);
  }, []);

  const fetchReviews = useCallback(async (pageToken?: string) => {
    setLoadingReviews(true);
    setReviewsError(null);
    try {
      const url = pageToken ? `/api/gbp/reviews?pageToken=${pageToken}` : '/api/gbp/reviews';
      const res = await fetch(url);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setReviewsError(d.error ?? 'Failed to load reviews');
      } else {
        const data = await res.json();
        setReviews((prev) => pageToken ? [...prev, ...(data.reviews ?? [])] : (data.reviews ?? []));
        setNextPageToken(data.nextPageToken ?? null);
        if (data.totalReviewCount != null) setTotalReviews(data.totalReviewCount);
        if (data.averageRating != null) setAvgRating(data.averageRating);
      }
    } catch {
      setReviewsError('Network error loading reviews');
    } finally {
      setLoadingReviews(false);
    }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  useEffect(() => {
    if (status?.connected && status.locationName) {
      fetchReviews();
    } else if (status?.connected && !status.locationName) {
      setLoadingAccounts(true);
      setAccountsError(null);
      fetch('/api/gbp/accounts')
        .then(async (r) => {
          if (!r.ok) {
            const d = await r.json().catch(() => ({}));
            setAccountsError(d.error ?? 'Failed to load accounts');
          } else {
            const d = await r.json();
            setAccounts(d.accounts ?? []);
          }
        })
        .catch(() => setAccountsError('Network error loading accounts'))
        .finally(() => setLoadingAccounts(false));
    }
  }, [status, fetchReviews]);

  const handleSelectLocation = async (locationName: string, accountName: string) => {
    setSavingLocation(true);
    await fetch('/api/gbp/location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locationName, accountName }),
    });
    await fetchStatus();
    setSavingLocation(false);
  };

  const handleDisconnect = async () => {
    if (!confirm('Disconnect Google Business Profile?')) return;
    setDisconnecting(true);
    setDisconnectError(null);
    try {
      const res = await fetch('/api/gbp/disconnect', { method: 'POST' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setDisconnectError(d.error ?? 'Failed to disconnect');
      } else {
        setReviews([]);
        setAccounts([]);
        await fetchStatus();
      }
    } catch {
      setDisconnectError('Network error — please try again');
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
          <Store className="w-5 h-5 text-primary" />
          Google Business Profile
        </h1>
        {status?.connected && (
          <button
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="text-xs text-destructive hover:underline disabled:opacity-50"
          >
            {disconnecting ? 'Disconnecting…' : 'Disconnect'}
          </button>
        )}
      </div>

      {flash === 'error' && (
        <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
          <AlertCircle className="w-4 h-4 shrink-0" />
          Connection failed. Please try again.
        </div>
      )}
      {disconnectError && (
        <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {disconnectError}
        </div>
      )}

      {/* Not connected */}
      {!status?.connected && (
        <div className="card-surface space-y-4 text-center py-10">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Store className="w-6 h-6 text-primary" />
          </div>
          <div>
            <p className="font-medium text-foreground">Connect your Google Business Profile</p>
            <p className="text-sm text-muted-foreground mt-1">Reply to reviews directly from RivalRadar.</p>
          </div>
          <a
            href="/api/auth/google-business"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:opacity-90"
          >
            Connect Google Business
          </a>
        </div>
      )}

      {/* Connected — pick a location */}
      {status?.connected && !status.locationName && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-green-600">
            <CheckCircle className="w-4 h-4" />
            Connected — select your business location
          </div>

          {loadingAccounts && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading accounts…
            </div>
          )}

          {accountsError && (
            <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {accountsError}
            </div>
          )}

          {accounts.map((account) => (
            <div key={account.name} className="card-surface space-y-2">
              <button
                onClick={() => setExpandedAccount(expandedAccount === account.name ? null : account.name)}
                className="w-full flex items-center justify-between text-sm font-medium text-foreground"
              >
                <span>{account.accountName}</span>
                {expandedAccount === account.name ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>

              {expandedAccount === account.name && (
                <div className="space-y-1 pt-1">
                  {account.locations.length === 0 && (
                    <p className="text-xs text-muted-foreground">No locations found</p>
                  )}
                  {account.locations.map((loc) => (
                    <button
                      key={loc.name}
                      onClick={() => handleSelectLocation(loc.name, account.name)}
                      disabled={savingLocation}
                      className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-muted disabled:opacity-50 transition-colors"
                    >
                      {loc.locationName || loc.name}
                      {loc.storefrontAddress?.addressLines?.[0] && (
                        <span className="block text-xs text-muted-foreground">{loc.storefrontAddress.addressLines[0]}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Connected + location set — reviews dashboard */}
      {status?.connected && status.locationName && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle className="w-4 h-4" />
              <span>
                {status.locationName.split('/').slice(-2).join('/')}
              </span>
            </div>
            <button
              onClick={async () => {
                await fetch('/api/gbp/location', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ locationName: null, accountName: null }),
                });
                setReviews([]);
                await fetchStatus();
              }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Change location
            </button>
          </div>

          {(totalReviews != null || avgRating != null) && (
            <div className="flex gap-4">
              {avgRating != null && (
                <div className="card-surface flex items-center gap-2">
                  <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                  <span className="text-sm font-semibold">{avgRating.toFixed(1)}</span>
                  <span className="text-xs text-muted-foreground">avg rating</span>
                </div>
              )}
              {totalReviews != null && (
                <div className="card-surface flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold">{totalReviews}</span>
                  <span className="text-xs text-muted-foreground">total reviews</span>
                </div>
              )}
            </div>
          )}

          {reviewsError && (
            <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {reviewsError}
            </div>
          )}

          {loadingReviews && reviews.length === 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading reviews…
            </div>
          )}

          {reviews.length === 0 && !loadingReviews && !reviewsError && (
            <p className="text-sm text-muted-foreground">No reviews found for this location.</p>
          )}

          <div className="space-y-3">
            {reviews.map((review) => (
              <ReviewCard
                key={review.name}
                review={review}
              />
            ))}
          </div>

          {nextPageToken && (
            <button
              onClick={() => fetchReviews(nextPageToken)}
              disabled={loadingReviews}
              className="w-full py-2 text-sm text-primary hover:underline disabled:opacity-50"
            >
              {loadingReviews ? 'Loading…' : 'Load more reviews'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
