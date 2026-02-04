# Marketing Toolkit

A comprehensive marketing toolkit with AI-powered tools for campaign creation, customer segmentation, and data analysis. Connects to Metabase for customer data access.

## Overview

This application provides 4 marketing tools:

1. **Email Marketing Tool** - AI-powered email list generation using OpenAI to analyze campaign concepts and suggest customer segments
2. **BrainWorks Filtering** - Filter and export contact lists with multi-select filters (defaults to BrainWorks Data, compact "Add Filter" interface)
3. **BrainWorks Analysis Tool** - Multiple analysis models with visualizations (defaults to BrainWorks Data):
   - RFM Segmentation (Recency, Frequency, Monetary scoring)
   - Campaign Response Model (market/campaign conversion analysis)
   - Propensity-to-Respond Model (predicted purchase probability)
   - Reactivation Model (dormant high-value customer targeting)
   - Prospect Lookalike Model (similarity to top buyers)
   - Product Affinity Model (cross-sell opportunities)
   - ROI Optimization Model (campaign profitability analysis)
4. **Trend & ICP Analysis** - Trend analysis and Ideal Customer Profile identification (defaults to GalaxyMaster/Astro DB):
   - Period-over-period customer activity trends
   - ICP segment identification with scores and characteristics
   - Option to exclude mailed contacts from analysis
   - AI-powered insights and summary

## Architecture

### Frontend (React + TypeScript)
- **Location**: `client/src/`
- **Framework**: React with Vite
- **Styling**: Tailwind CSS with shadcn/ui components
- **State Management**: TanStack Query for server state
- **Routing**: Wouter
- **Navigation**: Shadcn Sidebar component

### Backend (Express + TypeScript)
- **Location**: `server/`
- **API**: RESTful endpoints for Metabase and AI integration
- **AI**: OpenAI gpt-4o via Replit AI Integrations (no API key required)

### Key Components

**Sidebar & Navigation**
- `client/src/App.tsx` - Main app with SidebarProvider and routing
- `client/src/components/app-sidebar.tsx` - Navigation sidebar with 4 tools

**Email Marketing Tool (V2 - Two-Table Architecture)**
- `client/src/pages/email-marketing.tsx` - AI-powered campaign creation with:
  - **Two-Table Architecture** matching the process diagram:
    - T1 (Master Email List): Contains contact data (Email, Name, DOB, Segment, Source)
    - T2 (History/Behavior Log): Contains email history (Email, CampaignID, SentDate, Opened, Clicked)
  - **Input Phase**: Campaign concept (fuzzy) + Hard filters (Birthday, Exclude Days, Contact Cap)
  - **AI Analysis Phase**: AI analyzes T1 schema → suggests segments in "field_name:value" format
  - **Query Orchestration**: System builds filters from AI suggestions + applies T2 exclusions
  - **Data Processing**: Shows total candidates, excluded count, and final count with ranking
  - **Preview & Export**: Real data preview with engagement scores, CSV export
- `server/openai.ts` - OpenAI integration for concept analysis (schema analysis, not data retrieval)
- `server/routes.ts` - V2 endpoints: `/api/ai/analyze-concept-v2`, `/api/ai/preview-v2`, `/api/ai/export-v2`

**Filtering Tool**
- `client/src/pages/brainworks-filtering.tsx` - Metabase filter tool
- `client/src/components/filter-card.tsx` - Individual filter controls
- `client/src/components/filter-panel.tsx` - Filter grid and search
- `client/src/components/results-panel.tsx` - Count display and export
- `client/src/components/database-selector.tsx` - Database/table selection
- `client/src/components/export-dialog.tsx` - Mailing list preview and download

**Backend**
- `server/routes.ts` - API endpoints (Metabase + AI)
- `server/metabase.ts` - Metabase API integration

### Data Flow

**Email Marketing (Two-Table Architecture V2):**
1. User selects database → tables load
2. User selects T1 (Master Email List) table - required
3. User optionally selects T2 (History/Behavior Log) table - enables exclusions
4. User enters campaign concept (fuzzy input) and sets hard filters:
   - Birthday Filter (e.g., "next month")
   - Exclude Recently Sent (days) - requires T2
   - Contact Cap (max contacts to export)
5. AI analyzes T1 schema → suggests segments in "field_name:value" format
6. User selects segments → system builds query with T1 filters + T2 exclusions
7. Preview shows: total candidates, excluded count, final count, sample contacts with engagement scores
8. User exports mailing list as CSV (up to contact cap)

**Filtering Tool:**
1. User selects database → tables load
2. User selects table → fields load
3. User applies filters → count updates in real-time
4. User clicks "Generate Mailing List" → data exports to CSV

## API Endpoints

**Metabase Endpoints:**
- `GET /api/metabase/databases` - List available databases
- `GET /api/metabase/databases/:id/tables` - List tables in database
- `GET /api/metabase/databases/:id/tables-with-fields` - Get all tables with their fields (for multi-table analysis)
- `GET /api/metabase/tables/:id/fields` - List fields in table
- `POST /api/metabase/count` - Get matching record count
- `POST /api/metabase/field-options` - Get distinct values for a field
- `POST /api/metabase/export` - Generate mailing list

**AI Endpoints (V1 - Legacy):**
- `POST /api/ai/analyze-concept` - Analyze campaign concept with OpenAI
- `POST /api/ai/preview` - Get contact preview for selected segments
- `POST /api/ai/export` - Export email list as CSV
- `POST /api/ai/custom-analysis` - Run AI-powered custom analysis on BrainWorks Data
- `POST /api/ai/trends-icp-analysis` - Run AI-powered trend and ICP analysis on GalaxyMaster/Astro data

**AI Endpoints (V2 - Two-Table Architecture):**
- `POST /api/ai/analyze-concept-v2` - Analyze concept against T1 Master Table, with T2 History context
- `POST /api/ai/preview-v2` - Preview with T1 filters + T2 exclusions, shows total/excluded/final counts
- `POST /api/ai/export-v2` - Export CSV from T1 with T2 exclusions applied

**BrainWorks Analysis Endpoints:**
- `GET /api/brainworks/database` - Get BrainWorks database info and tables
- `POST /api/brainworks/analysis` - Run analysis model on BrainWorks data:
  - Uses real Metabase data with intelligent field pattern matching
  - Detects numeric fields (revenue, cost, LTV, quantity) by base_type validation
  - Aggregates actual sums for ROI/revenue calculations when numeric fields exist
  - Returns dataQuality indicator: 'real' (has numeric fields), 'estimated' (counts only), 'insufficient' (no suitable fields)
  - UI shows Data Quality Badge (green "Real Data", yellow "Estimated", red "Insufficient Data")

**Optimized SQL Analysis Endpoints (Database-driven, no AI):**
- `GET /api/analysis/snapshot` - Cross-sell overlap analysis for GalaxyMaster/Astro DB:
  - Runs optimized native SQL query on 22M+ row galaxy_individual table
  - Returns: totalCustomers, buyers by brand (GL, TSI, SY, MD), cross-sell overlaps
  - Uses SUM(CASE WHEN...) for efficient aggregation
- `GET /api/analysis/icp` - Top ICP segments analysis:
  - Returns TOP 50 customer segments by Avg Total LTV
  - Groups by: gender, age group (calculated from ddob), location (prefecture)
  - Includes: customer count, avg combined LTV, mobile/email rates
  - Uses DATEDIFF for age calculation, ISNULL for handling missing data
- `POST /api/analysis/ai-summary` - AI-powered summary of analysis data:
  - Accepts pre-aggregated snapshot and ICP data (NOT raw database rows)
  - Uses OpenAI gpt-4o to generate 3-sentence marketing insights
  - Returns: summary, topDemographic, crossSellOpportunity, contactabilityWarning
  - Token-efficient: Only sends ~50 rows of aggregated data to AI
- `POST /api/analysis/icp/customers` - Paginated customer view for ICP segments:
  - Body: { gender, ageGroup, location, page, excludeMailed }
  - Uses OFFSET/FETCH for T-SQL pagination (50 rows per page)
  - Returns: { customers, pagination: { page, pageSize, totalCount, totalPages, hasMore }, segment }
  - Respects excludeMailed flag to filter out mailed contacts
- `GET /api/analysis/icp/export` - Streaming CSV export for ICP segments:
  - Query params: gender, ageGroup, location, excludeMailed
  - Streams data in batches of 1000 rows (never loads full dataset into RAM)
  - Uses res.write() per row for memory-efficient streaming
  - Returns: CSV file attachment with customer data

## Environment Variables

**Secrets (Required):**
- `METABASE_URL` - Metabase instance URL (e.g., https://example.metabaseapp.com)
- `METABASE_EMAIL` - Metabase login email
- `METABASE_PASSWORD` - Metabase login password

**Auto-configured (Replit AI Integrations):**
- `AI_INTEGRATIONS_OPENAI_API_KEY` - OpenAI API key
- `AI_INTEGRATIONS_OPENAI_BASE_URL` - OpenAI base URL

## Running the Application

The application runs via the "Start application" workflow which executes `npm run dev`.
- Frontend: Port 5000
- Backend: Port 5000 (same port, Vite proxy)

## Development Notes

- Uses Metabase's session-based authentication (cached for 13 days)
- Filter queries use Metabase's MBQL (Metabase Query Language)
- OpenAI uses gpt-4o model with JSON response format
- Email Marketing now uses real Metabase data for preview and export
- AI segments are parsed from "field_name:value" format into Metabase filters
- Export is limited to 1000 records by default (configurable via Contact Cap)

### BrainWorks Analysis Tool

The BrainWorks Analysis tool now uses real Metabase data instead of AI-generated mock numbers:
- Backend uses field pattern matching to find relevant columns (segment, market, campaign, revenue, product)
- Analysis endpoint auto-detects field types and generates appropriate aggregations based on model type
- All 7 core models (RFM, Campaign Response, Propensity, Reactivation, Lookalike, Product Affinity, ROI) fetch real database records
- Charts use responsive containers with horizontal scrolling, angled X-axis labels, and proper font sizing
- Table selector appears when multiple tables exist in BrainWorks database
- Loading states and empty states display for each analysis view
- Total record counts shown for each analysis
