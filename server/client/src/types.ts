export interface LocationData {
  id: number;
  placeId: string;
  branchCode: string;
  branchName: string;
  address: string;
  lat: number | null;
  lng: number | null;
  name: string;
  status: string;
  // Source coordinates from the uploaded sheet. Older uploads stored these as
  // 0 rather than null, so consumers must treat 0 as "missing" too.
  srcLat: number | null;
  srcLng: number | null;
  hasCoords?: boolean;
  midNmid: number | string;
  sorotLink?: string;
}

export interface Stats {
  total: number;
  byStatus: Record<string, number>;
  byBranch: Record<string, number>;
}

export interface ColumnMapping {
  placeId?: string;
  branchCode?: string;
  branchName?: string;
  address?: string;
  lat?: string;
  lng?: string;
  name?: string;
  status?: string;
  srcLat?: string;
  srcLng?: string;
  midNmid?: string;
}

export interface ProductPerformance {
  product: string;
  performanceValue: number;
  growthRate?: number;
  aum?: number;
  customerCount?: number;
}

export interface BranchRadarData {
  laggingScore: number | null;
  laggingClass: string | null;
  leadingScore: number | null;
  leadingClass: string | null;
  leadingGreen: number;
  leadingTotal: number;
  growthRate: number | null;
  hasNominalData: boolean;
  dpkProducts: ProductPerformance[];
  kreditProducts: ProductPerformance[];
  leadingProducts: ProductPerformance[];
}

export interface BranchPerformance {
  id: number;
  branchCode: string;
  branchName: string;
  lat: number;
  lng: number;
  performance: 'stagnant' | 'growing' | 'important';
  performanceValue: number;
  totalCredit?: number;
  totalDpk?: number;
  creditPerformance?: number;
  dpkPerformance?: number;
  address: string;
  growthRate?: number;
  aum?: number;
  customerCount?: number;
  products?: ProductPerformance[];
  laggingScore?: number | null;
  laggingClass?: string | null;
  leadingScore?: number | null;
  leadingClass?: string | null;
  leadingGreen?: number;
  leadingTotal?: number;
  hasNominalData?: boolean;
  dpkProducts?: ProductPerformance[];
  kreditProducts?: ProductPerformance[];
  leadingProducts?: ProductPerformance[];
}

export interface NearbyLead {
  id: string;
  name: string;
  lat: number;
  lng: number;
  type: string;
  distance: number;
  osmId: string;
}

export interface OSMBusiness {
  osmId: string;
  name: string;
  lat: number;
  lng: number;
  type: string;
  category: string;
  distance: number;
  tags: Record<string, string>;
}

export interface BusinessDensity {
  total: number;
  byCategory: Record<string, number>;
  radius: number;
  centerLat: number;
  centerLng: number;
}

export interface ECHOBusiness {
  id: string;
  name: string;
  segment: string;
  businessType: 'anchor' | 'supplier' | 'buyer' | 'outlet' | 'related' | 'individual' | 'pebisnis' | string;
  lat: number;
  lng: number;
  branchCode: string;
  productsHeld: string[];
  ecommercePotential: number;
  socialNetworkStrength: number;
  priorityScore: number;
  priorityTier: 'High' | 'Medium' | 'Low';
  mandiriCustomer: boolean;
  transactionInValue?: number;
  transactionOutValue?: number;
}

export interface ECHORelationship {
  id?: string;
  fromBusinessId: string;
  toBusinessId: string;
  type: 'supplier' | 'buyer' | 'outlet' | 'partner' | 'distributor' | 'social' | 'ecommerce';
  category: string;
  transactionValue: number;
  transactionVolume: number;
  closedLoop: boolean;
}

export interface ECHOBusinessTypeStat {
  count: number;
  transactionInValue: number;
  transactionOutValue: number;
}

export type ECHOBusinessTypeStats = Record<string, ECHOBusinessTypeStat>;

export interface ECHOMetrics {
  totalTransactionValue: number;
  closedLoopValue: number;
  closedLoopPercent: number;
  leakagePercent: number;
  closedLoopCycleCount: number;
  closedLoopCycleValue: number;
  ecommercePotentialTotal: number;
  socialNetworkTotal: number;
  avgSocialNetworkStrength: number;
  mandiriCustomerCount: number;
  byBusinessType: ECHOBusinessTypeStats;
  businessCount: number;
  relationshipCount: number;
  topPotential: Array<{
    id: string;
    name: string;
    segment: string;
    businessType: string;
    priorityScore: number;
    priorityTier: string;
  }>;
}

export interface ECHEcosystem {
  id: string;
  anchorName: string;
  anchorSegment: string;
  branchCode: string;
  businesses: ECHOBusiness[];
  relationships: ECHORelationship[];
  metrics?: ECHOMetrics;
}

export interface ECHOSignal {
  id: string;
  ecosystemId: string;
  type: 'new_business' | 'expanding' | 'partnership' | 'registration';
  source: string;
  detectedAt: string;
  description: string;
}

export interface DENYUTSignal {
  id: string;
  customerId: string;
  customerName: string;
  customerSegment: string;
  branchCode: string;
  triggerType: 'transaction_spike' | 'new_payroll' | 'idle_balance' | 'dormant' | 'large_deposit' | 'frequent_withdrawal';
  detectedAt: string;
  suggestedProduct: string;
  status: 'new' | 'assigned' | 'contacted' | 'converted' | 'dismissed';
  urgency: 'low' | 'medium' | 'high' | 'critical';
  assignedRm?: string;
  transactionValue?: number;
}

export interface DENYUTCustomer {
  id: string;
  name: string;
  segment: string;
  branchCode: string;
  productsHeld: string[];
  totalBalance: number;
}