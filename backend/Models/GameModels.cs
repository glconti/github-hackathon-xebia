namespace BattleshipOnline.Models
{
    public class Position
    {
        public int Row { get; set; }
        public int Col { get; set; }
    }

    public class ShipPosition
    {
        public int ShipId { get; set; }
        public required string ShipName { get; set; }
        public List<Position> Positions { get; set; } = new List<Position>();
    }
}
