import { Model, Optional } from "sequelize";

interface InsultAttributes {
    iid: number,
    content: string,
    used: number,
    by: number
}

interface InsultCreationAttributes extends Optional<InsultAttributes, "iid" | "used" | "by"> { }

export class Insult extends Model<InsultAttributes, InsultCreationAttributes> implements InsultAttributes{
    public iid!: number;
    public content!: string;
    public used!: number;
    public by!: number;
    public readonly createdAt!: Date;
    public readonly lastUsed!: Date;
}