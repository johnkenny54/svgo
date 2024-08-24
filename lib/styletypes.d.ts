declare class CSSSelector {
  hasAttributeSelector(attName?: string): boolean;
}

export type Specificity = [number, number, number];

export type StylesheetDeclaration = {
  name: string;
  value: string;
  important: boolean;
};

export type StylesheetRule = {
  dynamic: boolean;
  selector: string;
  selectorObj: CSSSelector;
  specificity: Specificity;
  declarations: StylesheetDeclaration[];
};
