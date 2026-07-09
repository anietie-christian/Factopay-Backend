resource "aws_vpc" "factopay_vpc" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name = "factopay-${var.environment}-vpc"
  }
}

resource "aws_internet_gateway" "igw" {
  vpc_id = aws_vpc.factopay_vpc.id

  tags = {
    Name = "factopay-${var.environment}-igw"
  }
}

resource "aws_subnet" "public_1" {
  vpc_id            = aws_vpc.factopay_vpc.id
  cidr_block        = "10.0.1.0/24"
  availability_zone = "${var.aws_region}a"

  tags = {
    Name = "factopay-${var.environment}-public-1"
  }
}

resource "aws_subnet" "private_1" {
  vpc_id            = aws_vpc.factopay_vpc.id
  cidr_block        = "10.0.10.0/24"
  availability_zone = "${var.aws_region}a"

  tags = {
    Name = "factopay-${var.environment}-private-1"
  }
}

resource "aws_subnet" "private_2" {
  vpc_id            = aws_vpc.factopay_vpc.id
  cidr_block        = "10.0.11.0/24"
  availability_zone = "${var.aws_region}b"

  tags = {
    Name = "factopay-${var.environment}-private-2"
  }
}

resource "aws_route_table" "public_rt" {
  vpc_id = aws_vpc.factopay_vpc.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.igw.id
  }

  tags = {
    Name = "factopay-${var.environment}-public-rt"
  }
}

resource "aws_route_table_association" "public_assoc" {
  subnet_id      = aws_subnet.public_1.id
  route_table_id = aws_route_table.public_rt.id
}

# ---------------------------------------------
# SECURITY GROUPS
# ---------------------------------------------
resource "aws_security_group" "ec2_sg" {
  name        = "factopay-${var.environment}-ec2-sg"
  description = "Access rules for FactoPay EC2 instance"
  vpc_id      = aws_vpc.factopay_vpc.id

  # Inbound HTTP/HTTPS restricted to Cloudflare IPv4 Ranges
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = [
      "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", 
      "103.31.4.0/22", "141.101.64.0/18", "108.162.192.0/18", 
      "190.93.240.0/20", "188.114.96.0/20", "197.234.240.0/22", 
      "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13", 
      "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22"
    ]
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [
      "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", 
      "103.31.4.0/22", "141.101.64.0/18", "108.162.192.0/18", 
      "190.93.240.0/20", "188.114.96.0/20", "197.234.240.0/22", 
      "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13", 
      "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22"
    ]
  }

  # Inbound SSH restricted to Administrator IP
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.admin_ssh_ip]
  }

  # Outbound access allowed
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "factopay-${var.environment}-ec2-sg"
  }
}

resource "aws_security_group" "db_sg" {
  name        = "factopay-${var.environment}-db-sg"
  description = "Access rules for RDS Database"
  vpc_id      = aws_vpc.factopay_vpc.id

  # Accept database connections only from the EC2 security group
  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ec2_sg.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "factopay-${var.environment}-db-sg"
  }
}

# ---------------------------------------------
# OUTPUTS
# ---------------------------------------------
output "vpc_id" {
  value = aws_vpc.factopay_vpc.id
}

output "public_subnet_id" {
  value = aws_subnet.public_1.id
}

output "private_subnet_ids" {
  value = [aws_subnet.private_1.id, aws_subnet.private_2.id]
}

output "ec2_sg_id" {
  value = aws_security_group.ec2_sg.id
}

output "db_sg_id" {
  value = aws_security_group.db_sg.id
}
