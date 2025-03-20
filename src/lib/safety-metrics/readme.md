


# 1. Safety metrics feature overview

The Safety Metrics feature provides users with essential safety information for location within the radius of their accommodation location (lat/lng). It transforms official police data into intuitive safety indicators that address common user concerns.

## 2. Problem Statement

Users need easily interpretable safety information when evaluating accommodation location. This feature translates complex police data into practical insights focused on five key safety dimensions that matter most to users.

## 3. User Value Proposition

- **Primary Value**: Enables informed decisions about neighborhoods based on actual crime data
- **Differentiation**: Translates complex crime statistics into question-based metrics users can immediately understand

## 4. Detailed Requirements

### 4.1 Safety Metric Types

Each accommodation will be evaluated across five key safety dimensions:

| Metric Type | User Question | Description |
| --- | --- | --- |
| Night Safety | "Can I go outside after dark?" | Safety for pedestrians during evening/night hours |
| Vehicle Safety | "Can I park here safely?" | Risk of vehicle theft and break-ins |
| Child Safety | "Are kids safe here?" | Overall safety concerning crimes that could affect children |
| Transit Safety | "Is it safe to use public transport?" | Safety at and around transit locations |
| Women's Safety | "Would I be harassed here?" | Assessment of crimes that disproportionately affect women |

### 4.2 Metric Content Structure

For each safety metric, the platform will provide:

1. **Score**: Simple rating (1-10) with color coding
2. **Title**: The user question (e.g., "Can I go outside after dark?")
3. **Description**: Brief explanation of current safety status

### 4.3 Initial City Support

- Los Angeles - https://data.lacity.org/resource/2nrs-mtv8.json
    - Right now our API has a limit of returning 1000 rows of data at a time when querying the dataset. To query more than 1000 rows, there are two ways to go about this.
        
        **Using the off set parameter**
        
        Use the **'$offset='** parameter by setting it to 1000 increments which will allow you to page through the entire dataset 1000 rows at a time.
        
    - **Using the limit parameter**
        
        Another way is to use the **'$limit='** parameter which will set a limit on how much you query from a dataset. SODA 2.0 API endpoints have a max limit of 50,000 records while SODA 2.1 endpoints have no upper limit.
        
- (Framework designed for easy addition of future cities)

## 5. Data Analysis Approach

### 5.1 Data Sources

**MVP Data Sources:**

- LA: Los Angeles Police Department API

### 5.2 Data Analysis Techniques

1. For data analysis we will use python (important!)
2. **Crime Type Mapping**:
    - Create a standardized mapping of police codes to our five safety metrics
    - Example: Assign crimes like robbery, assault after 6pm to "Night Safety" category
    - Document each mapping decision for transparency
3. **Geographic Normalization**:
    - Normalize crime counts by district population and area.
    - Calculate incidents per 1,000 residents for fair comparison across districts
    - If you find more accurate way of normalization lets do that instead.
4. **Safety Score Calculation**:
    - Apply logarithmic scaling to prevent extreme outliers from skewing results
    - Calculate separate scores for each of the five safety dimensions
6. **Data Update Cycle**:
    - Monthly refresh of all metrics
    - Clear timestamp of when data was last updated

### 5.3 Police Data Guide Requirements

For each supported city:

- Data dictionary of relevant police codes
- Brief explanation of how police categorize crimes in that jurisdiction

## 6. User Experience (Simplified MVP)

### 6.1 Metric Display

- List all five metrics for each accommodation with scores
- Allow expand/collapse for additional details
- Radius of 2km around the accommodation

## 8. Implementation Plan

### 8.1 Phase 1 (Initial MVP)

- Implement for LA with other cities in the future in mind
- Basic five metrics with official police data
- Simple visualization
- Basic data processing pipeline

### 8.2 Next Steps (Post-MVP)

- Add support for additional cities
- Refine scoring algorithm based on user feedback
- Consider adding historical trend visualization
- Explore additional official data sources to complement police data

## 9. Risk Assessment & Mitigation

| Risk | Mitigation |
| --- | --- |
| Different crime categorization between cities | Create standardized mapping framework with city-specific adjustments |
| Data gaps or inconsistencies | Clearly indicate data limitations, implement data quality checks |
| Neighborhood stigmatization | Focus on practical safety information rather than comparative judgments |
| Misinterpretation of metrics | Provide clear context and explanation for each metric |

## 10. Technical Implementation Considerations

- Implement data processing scripts with proper error handling
- Create a database schema optimized for quick retrieval of metrics
- Plan for a scalable structure that can accommodate additional cities
- Think of a way how to effectively store the safety metrics in supabase as they dont have to be strained by official districs (the accommodation can be anywhere on the map)


Here's the proposed file structure we'll create:

src/lib/safety-metrics/
├── crimemapping/
│   ├── la/
│   │   ├── __init__.py
│   │   └── crime_types.py      # LA crime type mappings
├── scripts/
│   ├── __init__.py
│   ├── config.py               # Configuration from .env
│   ├── database.py             # Supabase operations
│   ├── grid.py                 # Grid system logic
│   ├── metrics.py              # Safety score calculations
│   ├── fetch.py               # LA API data fetching
│   └── main.py                # Script entry point

Phase 1: Basic Infrastructure
Set up Python environment and dependencies
Create configuration module
Implement Supabase connection
Create grid system logic
Phase 2: Data Processing
Implement LA crime data fetching
Create crime type mappings
Basic data cleaning and validation
Phase 3: Score Calculation
Implement basic scoring algorithm
Calculate individual safety metrics
Compute confidence scores
Phase 4: Database Operations
Grid cell updates
Batch processing
Error handling
St

