export interface MediaGridItem {
    id: string | number;
    src: string;
    name: string;
    originalFile: any;
    size?: number;
    date?: Date | string;
    user?: string;
}
