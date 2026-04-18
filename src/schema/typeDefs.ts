export const typeDefs = /* GraphQL */ `
  type Query {
    """Get a single card by ID or card number"""
    card(id: Int, cardNumber: String): Card

    """Search and filter cards with pagination. Use pageSize: 0 to fetch all matching cards."""
    cards(filter: CardFilter, sort: CardSort, page: Int = 1, pageSize: Int = 20): CardConnection!

    """List all booster/starter sets"""
    sets: [String!]!

    """List all unique tags"""
    tags: [String!]!

    """List all unique hololive member names (derived from holomem card names)"""
    members: [String!]!

    """List all unique colors"""
    colors: [String!]!

    """List all unique rarities"""
    rarities: [String!]!
  }

  input CardFilter {
    cardType: CardType
    color: Color
    rarity: String
    setName: String
    bloomLevel: String
    tag: String
    """Exact match on card name (e.g. "Nanashi Mumei" returns all her cards across holomem, buzz, and oshi)"""
    name: String
    """Search by card name (partial match)"""
    search: String
    """Filter by support subtype (ITEM, STAFF, MASCOT, FAN, EVENT, TOOL)"""
    supportType: SupportType
    """Filter to only limited or non-limited cards"""
    isLimited: Boolean
    """Include buzz holomem cards (default: true). Set to false to exclude them."""
    includeBuzz: Boolean
  }

  type CardConnection {
    nodes: [Card!]!
    totalCount: Int!
    pageInfo: PageInfo!
  }

  type PageInfo {
    currentPage: Int!
    totalPages: Int!
    hasNextPage: Boolean!
  }

  type Card {
    id: Int!
    cardNumber: String!
    name: String!
    cardType: CardType!
    """Unified color string (e.g. "RED" or "RED, BLUE" for multi-color cards)"""
    color: String!
    """Colors this card has (most cards have one, some have multiple)"""
    colors: [String!]!
    rarity: String!
    """Sets this card appears in"""
    setNames: [String!]!
    releaseDate: String
    illustrator: String
    imageUrl: String
    """URL to the card's page on the official website"""
    cardUrl: String
    tags: [String!]!

    """HP for holomem cards"""
    hp: Int
    """Bloom level for holomem cards (Debut, 1st, 2nd, Spot)"""
    bloomLevel: String
    """Baton pass cost for holomem cards (array of colors)"""
    batonPass: [String!]
    """Life for oshi cards"""
    life: Int
    """Whether this is a Buzz holomem card"""
    isBuzz: Boolean!
    """Support subtype (Item, Staff, Mascot, Fan, Event, Tool) — only for support cards"""
    supportType: String
    """Whether this is a LIMITED card"""
    isLimited: Boolean!
    """Additional rules/ability text"""
    specialText: String
    """Extra text (e.g. 'You may include any number of this holomem in the deck')"""
    extraText: String

    """Arts/moves for holomem cards"""
    arts: [Art!]!
    """Skills for oshi cards"""
    oshiSkills: [OshiSkill!]!
    """Q&A entries from the official site"""
    qna: [QA!]!
    """Structured keywords (Gift, Collab Effect, Bloom Effect, ...)"""
    keywords: [Keyword!]!
  }

  type Keyword {
    """Keyword type (GIFT, COLLAB, BLOOM, or other uppercase identifier)"""
    type: String!
    """Keyword title (e.g. "Bodyguard", "Not! Nin-Nin!!")"""
    title: String!
    """Keyword description / effect text"""
    description: String!
  }

  type QA {
    question: String!
    answer: String!
  }

  type Art {
    name: String!
    """Damage value as string to preserve modifiers like "100+" """
    damage: String
    """Cost as array of colors (RED, GREEN, BLUE, WHITE, PURPLE, YELLOW, COLORLESS)"""
    cost: [String!]
    effectText: String
    """Bonus damage against specific colors (e.g. +50 vs WHITE)"""
    damageBonuses: [DamageBonus!]!
  }

  type DamageBonus {
    """Bonus amount as string (e.g. "+50")"""
    amount: String!
    """Colors that trigger the bonus"""
    colors: [String!]!
  }

  type OshiSkill {
    name: String!
    cost: String
    usageLimit: String
    effectText: String!
    skillType: OshiSkillType!
  }

  enum CardType {
    HOLOMEM
    OSHI
    SUPPORT
    CHEER
  }

  enum SupportType {
    ITEM
    STAFF
    MASCOT
    FAN
    EVENT
    TOOL
  }

  enum Color {
    WHITE
    GREEN
    RED
    BLUE
    PURPLE
    YELLOW
    NEUTRAL
  }

  enum OshiSkillType {
    OSHI
    SP_OSHI
  }

  enum CardSortField {
    NAME
    CARD_NUMBER
    HP
    RARITY
    COLOR
    CARD_TYPE
    RELEASE_DATE
    ID
  }

  enum SortOrder {
    ASC
    DESC
  }

  input CardSort {
    field: CardSortField!
    order: SortOrder = ASC
  }
`;
