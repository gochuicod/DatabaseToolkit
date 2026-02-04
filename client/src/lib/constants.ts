// Filter operator display names
export const OPERATOR_LABELS: Record<string, string> = {
  equals: "Equals",
  not_equals: "Does not equal",
  contains: "Contains",
  starts_with: "Starts with",
  ends_with: "Ends with",
  greater_than: "Greater than",
  less_than: "Less than",
  between: "Between",
  is_null: "Is empty",
  is_not_null: "Is not empty",
};

// Field types that support different operators
export const TEXT_OPERATORS = ["equals", "not_equals", "contains", "starts_with", "ends_with", "is_null", "is_not_null"];
export const NUMBER_OPERATORS = ["equals", "not_equals", "greater_than", "less_than", "between", "is_null", "is_not_null"];
export const DATE_OPERATORS = ["equals", "greater_than", "less_than", "between", "is_null", "is_not_null"];

// Base types mapping to operator groups
export const BASE_TYPE_OPERATORS: Record<string, string[]> = {
  "type/Text": TEXT_OPERATORS,
  "type/Integer": NUMBER_OPERATORS,
  "type/BigInteger": NUMBER_OPERATORS,
  "type/Float": NUMBER_OPERATORS,
  "type/Decimal": NUMBER_OPERATORS,
  "type/Date": DATE_OPERATORS,
  "type/DateTime": DATE_OPERATORS,
  "type/DateTimeWithLocalTZ": DATE_OPERATORS,
  "type/Time": DATE_OPERATORS,
  "type/Boolean": ["equals", "not_equals", "is_null", "is_not_null"],
};

// Default to text operators for unknown types
export const DEFAULT_OPERATORS = TEXT_OPERATORS;
