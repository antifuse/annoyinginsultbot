import { Model, Optional } from "sequelize";

interface InsultAttributes {
    iid: number,
    content: string,
    used: number,
}

interface InsultCreationAttributes extends Optional<InsultAttributes, "iid" | "used"> { }

export class Insult extends Model<InsultAttributes, InsultCreationAttributes> implements InsultAttributes{
    public iid!: number;
    public content!: string;
    public used!: number;

    public readonly createdAt!: Date;
    public readonly lastUsed!: Date;
}